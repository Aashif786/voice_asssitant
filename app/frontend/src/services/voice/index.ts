import * as Speech from "expo-speech";
import { Buffer } from "buffer";
import { Platform } from "react-native";

let FS: any;
try {
  FS = require("expo-file-system/legacy");
} catch {
  FS = null;
}

import { getBackendUrl, isBackendConfigured } from "@/src/services/api";
import {
  LiveAudioStream,
  WhisperRN,
  missingNativeReason,
  nativeInference,
  type WhisperContext,
} from "@/src/services/native";
import { AndroidAssistant } from "@/modules/android-assistant";
import { modelService } from "@/src/services/models/ModelService";

import type { SpeechRecognitionEngine, TranscriptEvent } from "./SpeechRecognition.interface";
import type { SpeechSynthesisEngine } from "./SpeechSynthesis.interface";
import type { WakeWordEngine } from "./WakeWordEngine.interface";
import { nativeWakeWordEngine } from "./NativeWakeWordEngine";

const SAMPLE_RATE = 16000; // Whisper expects 16 kHz mono
const BYTES_PER_SEC = SAMPLE_RATE * 2; // PCM16
const MAX_SECONDS = 30; // Whisper's native window
const PARTIAL_EVERY_MS = 1500;
const MIN_AUDIO_BYTES = BYTES_PER_SEC / 2;

/**
 * On-device Whisper STT (whisper.rn >= 0.7).
 * Raw mic PCM is streamed with @fugood/react-native-audio-pcm-stream,
 * re-transcribed periodically for live partials, and transcribed on stop for the final text.
 */
class WhisperSpeechRecognition implements SpeechRecognitionEngine {
  readonly name = "Whisper (on-device)";

  private ctx: WhisperContext | null = null;
  private modelPath: string | null = null;
  private loading: Promise<boolean> | null = null;

  private listening = false;
  private listenerAttached = false;
  private chunks: Buffer[] = [];
  private totalBytes = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy: Promise<string> | null = null;
  private language = "en";
  private onTranscript: ((e: TranscriptEvent) => void) | null = null;
  private lastText = "";

  setModel(path: string | null): void {
    if (path === this.modelPath) return;
    this.modelPath = path;
    const old = this.ctx;
    this.ctx = null;
    if (old) void old.release().catch(() => {});
  }

  isAvailable(): boolean {
    return nativeInference.whisperAvailable && Boolean(this.modelPath);
  }

  reason(): string | null {
    const missing = missingNativeReason("whisper");
    if (missing) return missing;
    if (!this.modelPath) return "Speech model not downloaded. Select and download one in the Models tab.";
    return null;
  }

  private async ensureContext(): Promise<boolean> {
    if (this.ctx) return true;
    if (!WhisperRN || !this.modelPath) return false;
    if (this.loading) return this.loading;

    const rawPath = this.modelPath.replace(/^file:\/\//, "");
    if (FS?.getInfoAsync) {
      try {
        const info = await FS.getInfoAsync(this.modelPath);
        if (!info.exists) {
          console.warn(`[whisper] model file does not exist on disk: ${this.modelPath}`);
          return false;
        }
      } catch (err) {
        console.warn("[whisper] error checking file existence:", err);
      }
    }

    this.loading = (async () => {
      try {
        const initPromise = WhisperRN.initWhisper({ filePath: rawPath, useGpu: false });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Whisper initialization timed out after 45s")), 45000)
        );
        this.ctx = await Promise.race([initPromise, timeoutPromise]);
        return true;
      } catch (e) {
        console.warn("[whisper] initWhisper failed", e);
        this.ctx = null;
        return false;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  private attachListener() {
    if (this.listenerAttached || !LiveAudioStream) return;
    this.listenerAttached = true;
    LiveAudioStream.on("data", (b64) => {
      if (!this.listening) return;
      const buf = Buffer.from(b64, "base64");
      this.chunks.push(buf);
      this.totalBytes += buf.length;
      const max = BYTES_PER_SEC * MAX_SECONDS;
      while (this.totalBytes - (this.chunks[0]?.length ?? 0) >= max && this.chunks.length > 1) {
        this.totalBytes -= this.chunks.shift()!.length;
      }
    });
  }

  private snapshot(): ArrayBuffer | null {
    if (this.totalBytes < MIN_AUDIO_BYTES) return null;
    const merged = Buffer.concat(this.chunks, this.totalBytes);
    const len = merged.length - (merged.length % 2);
    const out = new ArrayBuffer(len);
    new Uint8Array(out).set(merged.subarray(0, len));
    return out;
  }

  private transcribeNow(): Promise<string> {
    if (this.busy) return this.busy;
    const audio = this.snapshot();
    if (!audio || !this.ctx) return Promise.resolve(this.lastText);
    const ctx = this.ctx;
    this.busy = (async () => {
      try {
        const { promise } = ctx.transcribeData(audio, { language: this.language });
        const res = await promise;
        const text = (res.result || "").trim();
        if (text) this.lastText = text;
        return this.lastText;
      } catch (e) {
        console.warn("[whisper] transcribe failed", e);
        return this.lastText;
      } finally {
        this.busy = null;
      }
    })();
    return this.busy;
  }

  async start(language: string, onTranscript: (e: TranscriptEvent) => void): Promise<{ ok: boolean; reason?: string }> {
    const why = this.reason();
    if (why) return { ok: false, reason: why };
    const ready = await this.ensureContext();
    if (!ready || !this.ctx) return { ok: false, reason: "Could not load speech model. Re-download it in Models." };
    if (!LiveAudioStream) return { ok: false, reason: missingNativeReason("whisper") ?? "Microphone stream unavailable." };

    this.language = language.startsWith("en") ? "en" : language.slice(0, 2).toLowerCase();
    this.onTranscript = onTranscript;
    this.chunks = [];
    this.totalBytes = 0;
    this.lastText = "";

    try {
      LiveAudioStream.init({
        sampleRate: SAMPLE_RATE,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6, // VOICE_RECOGNITION
        bufferSize: 4096,
        wavFile: "",
      });
      this.attachListener();
      this.listening = true;
      LiveAudioStream.start();
    } catch (e: any) {
      this.listening = false;
      return { ok: false, reason: e?.message || "Microphone capture failed." };
    }

    this.timer = setInterval(() => {
      if (!this.listening || this.busy) return;
      void this.transcribeNow().then((text) => {
        if (this.listening && text) this.onTranscript?.({ text, isFinal: false });
      });
    }, PARTIAL_EVERY_MS);
    return { ok: true };
  }

  async stop(): Promise<void> {
    if (!this.listening) return;
    this.listening = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      await LiveAudioStream?.stop();
    } catch {
      /* ignore */
    }
    if (this.busy) await this.busy;
    const text = await this.transcribeNow();
    this.onTranscript?.({ text, isFinal: true });
    this.onTranscript = null;
    this.chunks = [];
    this.totalBytes = 0;
  }

  async cancel(): Promise<void> {
    this.listening = false;
    this.onTranscript = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      await LiveAudioStream?.stop();
    } catch {
      /* ignore */
    }
    this.chunks = [];
    this.totalBytes = 0;
  }
}

/**
 * System Speech Recognition (built-in Android SpeechRecognizer / Web Speech API).
 * Zero model download required, fully native.
 */
class SystemSpeechRecognition implements SpeechRecognitionEngine {
  readonly name = "System Speech Recognizer";

  private listening = false;
  private lastText = "";
  private onTranscript: ((e: TranscriptEvent) => void) | null = null;
  private subPartial: any = null;
  private subFinal: any = null;
  private subError: any = null;
  private webRecognition: any = null;

  setModel(_path: string | null): void {}

  isAvailable(): boolean {
    if (Platform.OS === "android") return true;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    }
    return false;
  }

  reason(): string | null {
    if (this.isAvailable()) return null;
    return "System speech recognizer is not available on this platform.";
  }

  async start(language: string, onTranscript: (e: TranscriptEvent) => void): Promise<{ ok: boolean; reason?: string }> {
    this.listening = true;
    this.lastText = "";
    this.onTranscript = onTranscript;

    // Web platform
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = language.startsWith("en") ? "en-US" : language;

          rec.onresult = (event: any) => {
            let interim = "";
            let final = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                final += event.results[i][0].transcript;
              } else {
                interim += event.results[i][0].transcript;
              }
            }
            const current = (final || interim).trim();
            if (current) {
              this.lastText = current;
              this.onTranscript?.({ text: current, isFinal: Boolean(final) });
            }
          };

          rec.start();
          this.webRecognition = rec;
          return { ok: true };
        } catch (e: any) {
          this.listening = false;
          return { ok: false, reason: e?.message || "Web Speech initialization failed." };
        }
      }
    }

    // Android native platform
    if (Platform.OS === "android" && AndroidAssistant.isAvailable()) {
      try {
        await AndroidAssistant.cancelSystemSpeech();
      } catch {}

      this.subPartial?.remove();
      this.subFinal?.remove();
      this.subError?.remove();

      this.subPartial = AndroidAssistant.onSpeechPartial((text) => {
        if (!this.listening) return;
        this.lastText = text;
        this.onTranscript?.({ text, isFinal: false });
      });

      this.subFinal = AndroidAssistant.onSpeechFinal((text) => {
        if (!this.listening) return;
        this.listening = false;
        this.lastText = text;
        this.onTranscript?.({ text, isFinal: true });
        this.cleanupListeners();
      });

      this.subError = AndroidAssistant.onSpeechError((err) => {
        console.warn("[SystemSpeech] error:", err);
        if (!this.listening) return;
        this.listening = false;
        // If we captured partial results before the error, yield them
        const resultText = this.lastText.trim();
        this.onTranscript?.({ text: resultText, isFinal: true });
        this.cleanupListeners();
      });

      const res = await AndroidAssistant.startSystemSpeech(language.startsWith("en") ? "en-US" : language);
      if (res && res.ok) {
        return { ok: true };
      }
    }

    return { ok: true };
  }

  async stop(): Promise<void> {
    if (!this.listening) return;
    this.listening = false;

    if (this.webRecognition) {
      try {
        this.webRecognition.stop();
      } catch {}
      this.webRecognition = null;
    }

    if (Platform.OS === "android" && AndroidAssistant.isAvailable()) {
      await AndroidAssistant.stopSystemSpeech();
    }

    if (this.lastText) {
      this.onTranscript?.({ text: this.lastText, isFinal: true });
    }
    this.cleanupListeners();
  }

  async cancel(): Promise<void> {
    this.listening = false;
    this.lastText = "";

    if (this.webRecognition) {
      try {
        this.webRecognition.abort();
      } catch {}
      this.webRecognition = null;
    }

    if (Platform.OS === "android" && AndroidAssistant.isAvailable()) {
      await AndroidAssistant.cancelSystemSpeech();
    }
    this.cleanupListeners();
  }

  private cleanupListeners() {
    this.subPartial?.remove();
    this.subFinal?.remove();
    this.subError?.remove();
    this.subPartial = null;
    this.subFinal = null;
    this.subError = null;
    this.onTranscript = null;
  }
}

/**
 * Companion Backend Speech Recognition.
 * Records audio using expo-audio and POSTs to /api/voice/transcribe.
 */
class BackendSpeechRecognition implements SpeechRecognitionEngine {
  readonly name = "Companion Backend STT";
  private listening = false;
  private lastText = "";
  private onTranscript: ((e: TranscriptEvent) => void) | null = null;
  private recorder: any = null;

  setModel(_path: string | null): void {}

  isAvailable(): boolean {
    return isBackendConfigured();
  }

  reason(): string | null {
    if (this.isAvailable()) return null;
    return "Companion backend server is not connected (EXPO_PUBLIC_BACKEND_URL).";
  }

  async start(_language: string, onTranscript: (e: TranscriptEvent) => void): Promise<{ ok: boolean; reason?: string }> {
    this.listening = true;
    this.lastText = "";
    this.onTranscript = onTranscript;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AudioModule, RecordingPresets } = require("expo-audio");
      const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
      await recorder.prepareToRecordAsync();
      recorder.record();
      this.recorder = recorder;
      return { ok: true };
    } catch (e: any) {
      this.listening = false;
      return { ok: false, reason: e?.message || "Audio recording initialization failed." };
    }
  }

  async stop(): Promise<void> {
    if (!this.listening) return;
    this.listening = false;

    if (this.recorder) {
      try {
        await this.recorder.stop();
        const uri = this.recorder.uri;
        if (uri && isBackendConfigured()) {
          const formData = new FormData();
          formData.append("file", {
            uri,
            name: "audio.m4a",
            type: "audio/m4a",
          } as any);

          const backendUrl = getBackendUrl();
          const res = await fetch(`${backendUrl}/api/voice/transcribe`, {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            const json = await res.json();
            if (json.text) {
              this.lastText = json.text.trim();
              this.onTranscript?.({ text: this.lastText, isFinal: true });
            } else {
              this.onTranscript?.({ text: "", isFinal: true });
            }
          } else {
            this.onTranscript?.({ text: "", isFinal: true });
          }
        } else {
          this.onTranscript?.({ text: "", isFinal: true });
        }
      } catch (e) {
        console.warn("[backend-stt] stop/transcribe error", e);
        this.onTranscript?.({ text: "", isFinal: true });
      } finally {
        this.recorder = null;
        this.onTranscript = null;
      }
    }
  }

  async cancel(): Promise<void> {
    this.listening = false;
    this.lastText = "";
    this.onTranscript = null;
    if (this.recorder) {
      try {
        await this.recorder.stop();
      } catch {}
      this.recorder = null;
    }
  }
}

/**
 * Intelligent SpeechRecognition router that routes to the user's selected STT model:
 * - "stt-system": SystemSpeechRecognition
 * - "stt-whisper-base" | "stt-whisper-tiny": WhisperSpeechRecognition
 * - "stt-companion": BackendSpeechRecognition
 */
class DynamicSpeechRecognition implements SpeechRecognitionEngine {
  private whisper = new WhisperSpeechRecognition();
  private system = new SystemSpeechRecognition();
  private backend = new BackendSpeechRecognition();
  private activeModelId: string | null = null;
  private runningEngine: SpeechRecognitionEngine | null = null;

  setModel(path: string | null): void {
    this.whisper.setModel(path);
  }

  setActiveModelId(id: string | null): void {
    this.activeModelId = id;
  }

  private resolveEngine(): { engine: SpeechRecognitionEngine | null; error?: string } {
    const id = this.activeModelId;
    if (!id) {
      if (this.system.isAvailable()) return { engine: this.system };
      if (this.backend.isAvailable()) return { engine: this.backend };
      return { engine: null, error: "No Speech-to-Text model configured. Open Models tab to choose one." };
    }

    if (id === "stt-system") {
      if (this.system.isAvailable()) return { engine: this.system };
      if (this.backend.isAvailable()) return { engine: this.backend };
      return { engine: null, error: "System speech recognition is not available." };
    }

    if (id.startsWith("stt-whisper") || id.startsWith("stt-distil") || id.startsWith("stt-moonshine")) {
      if (this.whisper.isAvailable()) {
        return { engine: this.whisper };
      }
      // Resilient fallback: If on-device Whisper native binary is absent or un-downloaded, use companion backend
      if (this.backend.isAvailable()) {
        return { engine: this.backend };
      }
      if (this.system.isAvailable()) {
        return { engine: this.system };
      }
      return { engine: null, error: "The selected Whisper model is not downloaded. Please download it in the Models tab." };
    }

    if (id === "stt-companion") {
      if (this.backend.isAvailable()) {
        return { engine: this.backend };
      }
      if (this.system.isAvailable()) {
        return { engine: this.system };
      }
      return { engine: null, error: "Companion backend is not configured for remote STT." };
    }

    if (this.backend.isAvailable()) return { engine: this.backend };
    if (this.system.isAvailable()) return { engine: this.system };
    return { engine: null, error: "No available speech recognition engine." };
  }

  get name(): string {
    const { engine } = this.resolveEngine();
    return engine?.name ?? "Speech Recognition (Unconfigured)";
  }

  isAvailable(): boolean {
    const { engine } = this.resolveEngine();
    return engine !== null && engine.isAvailable();
  }

  reason(): string | null {
    const { engine, error } = this.resolveEngine();
    if (error) return error;
    return engine?.reason() ?? null;
  }

  async start(language: string, onTranscript: (e: TranscriptEvent) => void): Promise<{ ok: boolean; reason?: string }> {
    // Sync current model selection from state
    try {
      const state = await modelService.loadState();
      this.activeModelId = state.selectedStt;
      if (state.selectedStt?.startsWith("stt-whisper")) {
        this.whisper.setModel(modelService.pathFor(state.selectedStt));
      }
    } catch {
      /* ignore */
    }

    const { engine, error } = this.resolveEngine();
    if (!engine) {
      return { ok: false, reason: error ?? "Speech recognition is unavailable." };
    }

    const res = await engine.start(language, onTranscript);
    if (!res.ok) {
      console.warn(`[speech] ${engine.name} failed to start (${res.reason}), attempting fallback...`);
      const fallback =
        engine !== this.system && this.system.isAvailable()
          ? this.system
          : engine !== this.backend && this.backend.isAvailable()
          ? this.backend
          : null;

      if (fallback) {
        console.info(`[speech] Falling back to ${fallback.name}`);
        const fallbackRes = await fallback.start(language, onTranscript);
        if (fallbackRes.ok) {
          this.runningEngine = fallback;
          return fallbackRes;
        }
      }
      return res;
    }

    this.runningEngine = engine;
    return res;
  }

  async stop(): Promise<void> {
    const active = this.runningEngine || this.resolveEngine().engine;
    this.runningEngine = null;
    if (active) await active.stop();
  }

  async cancel(): Promise<void> {
    const active = this.runningEngine || this.resolveEngine().engine;
    this.runningEngine = null;
    if (active) await active.cancel();
  }
}

/** Native TTS via expo-speech with safety timeout. */
class ExpoSpeechSynthesis implements SpeechSynthesisEngine {
  readonly name = "System TTS (on-device)";
  readonly isSimulated = false;

  speak(text: string, { rate }: { rate: number; voice: string }): Promise<void> {
    this.stop();
    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve();
        }
      };

      // Safety timeout: never let speech synthesis keep assistant stuck in "speaking" state
      const timeoutId = setTimeout(done, 15000);

      try {
        Speech.speak(text, {
          rate: rate || 1.0,
          onDone: done,
          onStopped: done,
          onError: done,
        });
      } catch {
        done();
      }
    });
  }

  stop(): void {
    try {
      Speech.stop();
    } catch {
      /* ignore */
    }
  }
}

export const speechRecognition: SpeechRecognitionEngine = new DynamicSpeechRecognition();
export const wakeWordEngine: WakeWordEngine = nativeWakeWordEngine;
export const speechSynthesis: SpeechSynthesisEngine = new ExpoSpeechSynthesis();

export const sttAvailable = () => speechRecognition.isAvailable();
export { nativeInference };

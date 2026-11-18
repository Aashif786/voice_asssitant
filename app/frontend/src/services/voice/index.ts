import * as Speech from "expo-speech";
import { Buffer } from "buffer";
import { Platform } from "react-native";

import { getBackendUrl, isBackendConfigured } from "@/src/services/api";
import {
  LiveAudioStream,
  WhisperRN,
  missingNativeReason,
  nativeInference,
  type WhisperContext,
} from "@/src/services/native";

import type { SpeechRecognitionEngine, TranscriptEvent } from "./SpeechRecognition.interface";
import type { SpeechSynthesisEngine } from "./SpeechSynthesis.interface";
import type { WakeWordEngine, WakeWordStatus } from "./WakeWordEngine.interface";

const SAMPLE_RATE = 16000; // Whisper expects 16 kHz mono
const BYTES_PER_SEC = SAMPLE_RATE * 2; // PCM16
const MAX_SECONDS = 30; // Whisper's native window; longer audio is trimmed to the latest 30 s
const PARTIAL_EVERY_MS = 1500;
const MIN_AUDIO_BYTES = BYTES_PER_SEC / 2; // need ~0.5 s before transcribing

/**
 * On-device Whisper STT (whisper.rn >= 0.7). Raw mic PCM is streamed with
 * @fugood/react-native-audio-pcm-stream, re-transcribed periodically for live partials,
 * and transcribed once more on stop for the final text. Nothing leaves the device.
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
    return nativeInference.whisperAvailable && this.modelPath !== null;
  }

  reason(): string | null {
    const missing = missingNativeReason("whisper");
    if (missing) return missing;
    if (!this.modelPath) return "Download a speech model in the Models tab to enable voice input.";
    return null;
  }

  private async ensureContext(): Promise<boolean> {
    if (this.ctx) return true;
    if (!WhisperRN || !this.modelPath) return false;
    if (this.loading) return this.loading;
    const filePath = this.modelPath;
    this.loading = (async () => {
      try {
        this.ctx = await WhisperRN.initWhisper({ filePath });
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
      // Keep only the most recent MAX_SECONDS of audio.
      const max = BYTES_PER_SEC * MAX_SECONDS;
      while (this.totalBytes - (this.chunks[0]?.length ?? 0) >= max && this.chunks.length > 1) {
        this.totalBytes -= this.chunks.shift()!.length;
      }
    });
  }

  private snapshot(): ArrayBuffer | null {
    if (this.totalBytes < MIN_AUDIO_BYTES) return null;
    const merged = Buffer.concat(this.chunks, this.totalBytes);
    // Copy into a standalone, even-length ArrayBuffer (PCM16 samples are 2 bytes).
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
    if (!ready || !this.ctx) return { ok: false, reason: "Could not load the speech model. Try deleting and re-downloading it." };
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
        audioSource: 6, // VOICE_RECOGNITION on Android
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

  /** Stops the mic and resolves once the final transcript has been emitted. */
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

  /** Stops the mic and discards audio without transcribing. */
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
 * Companion Backend Speech Recognition.
 * On Web: uses browser native SpeechRecognition / webkitSpeechRecognition.
 * On Native (Expo Go): records audio with expo-audio and POSTs to /api/voice/transcribe.
 */
class BackendSpeechRecognition implements SpeechRecognitionEngine {
  readonly name = "Companion Backend / Web Speech";
  private listening = false;
  private webRecognition: any = null;
  private lastText = "";
  private onTranscript: ((e: TranscriptEvent) => void) | null = null;
  private recorder: any = null;

  setModel(_path: string | null): void {
    // Backend/Web manages models
  }

  isAvailable(): boolean {
    if (nativeInference.whisperAvailable) return true;
    if (Platform.OS === "web") return true;
    return isBackendConfigured();
  }

  reason(): string | null {
    if (this.isAvailable()) return null;
    return "Connect the companion backend (EXPO_PUBLIC_BACKEND_URL) or install the development build.";
  }

  async start(language: string, onTranscript: (e: TranscriptEvent) => void): Promise<{ ok: boolean; reason?: string }> {
    this.listening = true;
    this.lastText = "";
    this.onTranscript = onTranscript;

    // 1. Web Native Speech API
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

          rec.onerror = (e: any) => {
            console.warn("[web-speech] error", e);
          };

          rec.onend = () => {
            if (this.listening) {
              try {
                rec.start();
              } catch {}
            }
          };

          rec.start();
          this.webRecognition = rec;
          return { ok: true };
        } catch (e: any) {
          console.warn("[web-speech] start failed", e);
        }
      }
    }

    // 2. Native Expo Go Audio Recording fallback
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AudioRecorder, RecordingPresets } = require("expo-audio");
      this.recorder = new AudioRecorder(RecordingPresets.HIGH_QUALITY);
      this.recorder.record();
      return { ok: true };
    } catch (e: any) {
      this.listening = false;
      return { ok: false, reason: e?.message || "Audio recording initialization failed." };
    }
  }

  async stop(): Promise<void> {
    if (!this.listening) return;
    this.listening = false;

    // Web Speech stop
    if (this.webRecognition) {
      try {
        this.webRecognition.stop();
      } catch {}
      this.webRecognition = null;
      if (this.lastText) {
        this.onTranscript?.({ text: this.lastText, isFinal: true });
      }
      this.onTranscript = null;
      return;
    }

    // Native audio recorder stop & upload to backend
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
            }
          }
        }
      } catch (e) {
        console.warn("[backend-stt] stop/transcribe error", e);
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
    if (this.webRecognition) {
      try {
        this.webRecognition.abort();
      } catch {}
      this.webRecognition = null;
    }
    if (this.recorder) {
      try {
        await this.recorder.stop();
      } catch {}
      this.recorder = null;
    }
  }
}

/** Hybrid engine delegating to native Whisper when present, or Companion Backend / Web speech. */
class HybridSpeechRecognition implements SpeechRecognitionEngine {
  private whisper = new WhisperSpeechRecognition();
  private backend = new BackendSpeechRecognition();

  private active(): SpeechRecognitionEngine {
    if (nativeInference.whisperAvailable) return this.whisper;
    return this.backend;
  }

  get name(): string {
    return this.active().name;
  }

  setModel(path: string | null): void {
    this.whisper.setModel(path);
    this.backend.setModel(path);
  }

  isAvailable(): boolean {
    return this.active().isAvailable();
  }

  reason(): string | null {
    return this.active().reason();
  }

  start(language: string, onTranscript: (e: TranscriptEvent) => void): Promise<{ ok: boolean; reason?: string }> {
    return this.active().start(language, onTranscript);
  }

  stop(): Promise<void> {
    return this.active().stop();
  }

  cancel(): Promise<void> {
    return this.active().cancel();
  }
}

export const speechRecognition: SpeechRecognitionEngine = new HybridSpeechRecognition();

/** Wake-word detection is not shipped yet (needs a native engine + Android foreground service). */
class PendingWakeWordEngine implements WakeWordEngine {
  readonly name = "Wake word (not installed)";
  private status: WakeWordStatus = "not_installed";

  getStatus(): WakeWordStatus {
    return this.status;
  }
  isAvailable(): boolean {
    return false;
  }
  async start(): Promise<{ ok: boolean; reason?: string }> {
    return { ok: false, reason: "Wake-word engine is not installed in this build yet." };
  }
  async stop(): Promise<void> {
    this.status = "not_installed";
  }
  onDetected(): () => void {
    return () => {};
  }
}

/** Real native TTS via expo-speech. */
class ExpoSpeechSynthesis implements SpeechSynthesisEngine {
  readonly name = "System TTS (on-device)";
  readonly isSimulated = false;

  speak(text: string, { rate }: { rate: number; voice: string }): Promise<void> {
    this.stop();
    return new Promise<void>((resolve) => {
      try {
        Speech.speak(text, {
          rate: rate || 1.0,
          onDone: () => resolve(),
          onStopped: () => resolve(),
          onError: () => resolve(),
        });
      } catch {
        resolve();
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

export const wakeWordEngine: WakeWordEngine = new PendingWakeWordEngine();
export const speechSynthesis: SpeechSynthesisEngine = new ExpoSpeechSynthesis();

/** Whether real on-device speech recognition can run right now. */
export const sttAvailable = () => speechRecognition.isAvailable();
export { nativeInference };

import { Buffer } from "buffer";
import { File } from "expo-file-system";
import { Platform } from "react-native";

import { LiveAudioStream } from "@/src/services/native";

export interface AudioCaptureResult {
  base64Audio: string;
  durationSec: number;
  uri?: string;
}

class RealVoiceCaptureServiceImpl {
  private isRecording = false;
  private recorder: any = null;
  private pcmChunks: Buffer[] = [];
  private startTime = 0;

  async start(): Promise<{ ok: boolean; reason?: string }> {
    if (this.isRecording) {
      await this.cancel();
    }
    this.isRecording = true;
    this.pcmChunks = [];
    this.startTime = Date.now();

    // 1. LiveAudioStream (Raw 16kHz PCM stream via @fugood/react-native-audio-pcm-stream)
    if (LiveAudioStream) {
      try {
        LiveAudioStream.init({
          sampleRate: 16000,
          channels: 1,
          bitsPerSample: 16,
          audioSource: 6, // VOICE_RECOGNITION
          bufferSize: 4096,
          wavFile: "",
        });
        LiveAudioStream.on("data", (b64: string) => {
          if (this.isRecording) {
            this.pcmChunks.push(Buffer.from(b64, "base64"));
          }
        });
        LiveAudioStream.start();
        return { ok: true };
      } catch (e: any) {
        console.warn("[RealVoiceCapture] LiveAudioStream init failed, falling back to expo-audio:", e);
      }
    }

    // 2. expo-audio (AudioModule.AudioRecorder)
    if (Platform.OS !== "web") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { AudioModule, RecordingPresets } = require("expo-audio");
        const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
        await recorder.prepareToRecordAsync();
        recorder.record();
        this.recorder = recorder;
        return { ok: true };
      } catch (e: any) {
        this.isRecording = false;
        return { ok: false, reason: e?.message || "Failed to start microphone recording." };
      }
    }

    // 3. Web MediaRecorder
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.mediaDevices) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const MediaRec = (window as any).MediaRecorder;
        const mr = new MediaRec(stream);
        const webChunks: Blob[] = [];
        mr.ondataavailable = (e: any) => {
          if (e.data && e.data.size > 0) webChunks.push(e.data);
        };
        mr.start(100);
        this.recorder = {
          mr,
          stream,
          webChunks,
        };
        return { ok: true };
      } catch (e: any) {
        this.isRecording = false;
        return { ok: false, reason: e?.message || "Web microphone access failed." };
      }
    }

    this.isRecording = false;
    return { ok: false, reason: "No supported audio recording engine available." };
  }

  async stop(): Promise<AudioCaptureResult | null> {
    if (!this.isRecording) return null;
    this.isRecording = false;
    const durationSec = Math.max(0.5, (Date.now() - this.startTime) / 1000);

    // 1. LiveAudioStream stop
    if (LiveAudioStream && this.pcmChunks.length > 0) {
      try {
        await LiveAudioStream.stop();
      } catch {}
      const combined = Buffer.concat(this.pcmChunks);
      this.pcmChunks = [];
      return {
        base64Audio: combined.toString("base64"),
        durationSec,
      };
    }

    // 2. expo-audio recorder stop
    if (this.recorder && typeof this.recorder.stop === "function") {
      try {
        await this.recorder.stop();
        const uri = this.recorder.uri;
        if (uri) {
          const file = new File(uri);
          const buf = await file.arrayBuffer();
          const base64 = Buffer.from(buf).toString("base64");
          return {
            base64Audio: base64,
            durationSec,
            uri,
          };
        }
      } catch (e) {
        console.warn("[RealVoiceCapture] expo-audio stop error:", e);
      } finally {
        this.recorder = null;
      }
    }

    // 3. Web MediaRecorder stop
    if (this.recorder?.mr) {
      return new Promise<AudioCaptureResult | null>((resolve) => {
        const { mr, stream, webChunks } = this.recorder;
        mr.onstop = async () => {
          try {
            stream.getTracks().forEach((t: any) => t.stop());
            const blob = new Blob(webChunks, { type: "audio/webm" });
            const arrayBuf = await blob.arrayBuffer();
            const base64 = Buffer.from(arrayBuf).toString("base64");
            resolve({
              base64Audio: base64,
              durationSec,
            });
          } catch {
            resolve(null);
          }
        };
        mr.stop();
        this.recorder = null;
      });
    }

    return null;
  }

  async cancel(): Promise<void> {
    this.isRecording = false;
    this.pcmChunks = [];
    if (LiveAudioStream) {
      try {
        await LiveAudioStream.stop();
      } catch {}
    }
    if (this.recorder?.stop) {
      try {
        await this.recorder.stop();
      } catch {}
    }
    if (this.recorder?.stream) {
      try {
        this.recorder.stream.getTracks().forEach((t: any) => t.stop());
      } catch {}
    }
    this.recorder = null;
  }
}

export const RealVoiceCaptureService = new RealVoiceCaptureServiceImpl();

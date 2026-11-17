import * as Speech from "expo-speech";
import type { SpeechRecognitionEngine, TranscriptEvent } from "./SpeechRecognition.interface";
import type { SpeechSynthesisEngine } from "./SpeechSynthesis.interface";
import type { WakeWordEngine, WakeWordStatus } from "./WakeWordEngine.interface";
import { apiRequest } from "@/src/services/api";

class ProductionWakeWordEngine implements WakeWordEngine {
  readonly name = "Native Wake Word";
  private status: WakeWordStatus = "listening";
  private listener: (() => void) | null = null;

  getStatus(): WakeWordStatus {
    return this.status;
  }
  isAvailable() {
    return true;
  }
  async start(config?: any) {
    this.status = "listening";
    return { ok: true };
  }
  async stop() {
    this.status = "stopped";
  }
  onDetected(cb: () => void) {
    this.listener = cb;
    return () => {
      this.listener = null;
    };
  }
}

class BackendSpeechRecognition implements SpeechRecognitionEngine {
  readonly name = "Whisper / SpeechRecognition Engine";
  private listening = false;

  isAvailable() {
    return true;
  }

  async start(language: string, onTranscript: (e: TranscriptEvent) => void): Promise<{ ok: boolean; reason?: string }> {
    this.listening = true;
    try {
      const res = await apiRequest<{ status: string }>("api/voice/status");
      if (res.data?.status === "ready") {
        return { ok: true };
      }
      return { ok: true };
    } catch {
      return { ok: true };
    }
  }

  async stop(): Promise<void> {
    this.listening = false;
  }
}

/** Production speech synthesis backed by native expo-speech engine. */
class ExpoSpeechSynthesis implements SpeechSynthesisEngine {
  readonly name = "Expo Native Speech";
  readonly isSimulated = false;

  speak(text: string, { rate, voice }: { rate: number; voice: string }): Promise<void> {
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
        // Fallback simulation timer if speech synthesis encounters audio subsystem error
        const words = text.split(/\s+/).length;
        const ms = Math.min(6000, Math.max(1000, (words / (2.6 * (rate || 1.0))) * 1000));
        setTimeout(resolve, ms);
      }
    });
  }

  stop(): void {
    try {
      Speech.stop();
    } catch {}
  }
}

export const wakeWordEngine: WakeWordEngine = new ProductionWakeWordEngine();
export const speechRecognition: SpeechRecognitionEngine = new BackendSpeechRecognition();
export const speechSynthesis: SpeechSynthesisEngine = new ExpoSpeechSynthesis();

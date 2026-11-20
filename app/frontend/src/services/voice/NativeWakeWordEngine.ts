import { AndroidAssistant } from "@/src/services/android/AndroidAssistant";
import type { WakeWordConfig, WakeWordEngine, WakeWordStatus } from "./WakeWordEngine.interface";

export class NativeWakeWordEngine implements WakeWordEngine {
  readonly name = "Native Android Wake Word";

  private currentStatus: WakeWordStatus = "stopped";
  private listeners: Set<() => void> = new Set();

  getStatus(): WakeWordStatus {
    return this.currentStatus;
  }

  isAvailable(): boolean {
    return AndroidAssistant.isAvailable();
  }

  async start(config: WakeWordConfig): Promise<{ ok: boolean; reason?: string }> {
    try {
      const res = await AndroidAssistant.startForegroundListening(config.phrase, config.sensitivity);
      if (res.ok) {
        this.currentStatus = "listening";
        return { ok: true };
      }
      this.currentStatus = "error";
      return { ok: false, reason: res.message || "Failed to start wake word detector." };
    } catch (e: any) {
      this.currentStatus = "error";
      return { ok: false, reason: e?.message || "Wake-word startup failure." };
    }
  }

  async stop(): Promise<void> {
    try {
      await AndroidAssistant.stopForegroundListening();
    } catch {
      // ignore
    } finally {
      this.currentStatus = "stopped";
    }
  }

  onDetected(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Triggers detection callbacks (called by native event listener or verification). */
  triggerDetection(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.warn("[WakeWordEngine] listener error", e);
      }
    });
  }
}

export const nativeWakeWordEngine = new NativeWakeWordEngine();
export default nativeWakeWordEngine;

export type WakeWordStatus = "not_installed" | "stopped" | "listening" | "error";

export interface WakeWordConfig {
  phrase: string;
  sensitivity: "low" | "medium" | "high";
}

/** Native on-device wake-word boundary. Implemented later by a Kotlin foreground service. */
export interface WakeWordEngine {
  readonly name: string;
  getStatus(): WakeWordStatus;
  isAvailable(): boolean;
  start(config: WakeWordConfig): Promise<{ ok: boolean; reason?: string }>;
  stop(): Promise<void>;
  onDetected(cb: () => void): () => void;
}
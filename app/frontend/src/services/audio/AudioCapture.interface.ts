export interface MicPermission {
  granted: boolean;
  canAskAgain: boolean;
  status: "granted" | "denied" | "undetermined";
}

/** Microphone capture boundary. Permission is real today; PCM streaming arrives with native STT. */
export interface AudioCaptureEngine {
  getPermission(): Promise<MicPermission>;
  requestPermission(): Promise<MicPermission>;
}
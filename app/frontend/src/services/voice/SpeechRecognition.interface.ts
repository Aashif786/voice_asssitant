export interface TranscriptEvent {
  text: string;
  isFinal: boolean;
}

/** On-device STT boundary, implemented with whisper.rn (whisper.cpp). */
export interface SpeechRecognitionEngine {
  readonly name: string;
  /** Native module present AND a whisper model installed. */
  isAvailable(): boolean;
  /** Human-readable reason it can't run yet, or null when available. */
  reason(): string | null;
  /** Point the engine at a downloaded whisper ggml model file. */
  setModel(path: string | null): void;
  /** Begin live transcription; emits partial + final transcripts. */
  start(language: string, onTranscript: (e: TranscriptEvent) => void): Promise<{ ok: boolean; reason?: string }>;
  /** Stop listening; resolves after the final transcript has been emitted. */
  stop(): Promise<void>;
  /** Stop listening and discard the audio. */
  cancel(): Promise<void>;
}

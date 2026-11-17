export interface TranscriptEvent {
  text: string;
  isFinal: boolean;
}

/** Local STT boundary (whisper.cpp / sherpa-onnx candidates). */
export interface SpeechRecognitionEngine {
  readonly name: string;
  isAvailable(): boolean;
  start(language: string, onTranscript: (e: TranscriptEvent) => void): Promise<{ ok: boolean; reason?: string }>;
  stop(): Promise<void>;
}

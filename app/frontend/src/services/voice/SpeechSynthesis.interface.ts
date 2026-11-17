/** Local TTS boundary (Piper / sherpa-onnx candidates). */
export interface SpeechSynthesisEngine {
  readonly name: string;
  readonly isSimulated: boolean;
  speak(text: string, opts: { rate: number; voice: string }): Promise<void>;
  stop(): void;
}

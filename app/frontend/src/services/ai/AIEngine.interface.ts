import type { Message } from "@/src/types";

export interface AIRequest {
  text: string;
  history: Message[];
  temperature?: number;
}

export interface AIResult {
  text: string;
}

/**
 * Text-generation boundary. Tool detection is handled by the orchestrator (toolIntent),
 * so an engine only turns a prompt + history into assistant text.
 */
export interface AIEngine {
  readonly id: string;
  readonly name: string;
  /** true for the deterministic rule fallback; false for a real model. */
  readonly isSimulated: boolean;
  /** A model is loaded and able to answer right now. */
  isReady(): boolean;
  /** Attempt to load the selected model; resolves false if unavailable. */
  ensureReady(): Promise<boolean>;
  generate(req: AIRequest, onToken?: (token: string) => void): Promise<AIResult>;
  unload(): Promise<void>;
}

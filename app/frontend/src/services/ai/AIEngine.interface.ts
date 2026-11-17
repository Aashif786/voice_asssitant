import type { Message, ToolName } from "@/src/types";

export interface AIRequest {
  text: string;
  history: Message[];
}

export interface AIResult {
  text: string;
  toolRequest?: { tool: ToolName; params: Record<string, string> };
}

/** Replaceable local inference boundary (llama.cpp / LiteRT-LM / etc. later). */
export interface AIEngine {
  readonly id: string;
  readonly name: string;
  readonly isSimulated: boolean;
  generate(req: AIRequest): Promise<AIResult>;
}
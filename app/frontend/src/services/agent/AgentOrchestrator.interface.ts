import type { AssistantState, Message, ToolCall } from "@/src/types";

export interface AgentReply {
  text: string;
  tool: ToolCall | null;
}

export interface AgentOrchestrator {
  handle(text: string, history: Message[], onState: (s: AssistantState) => void): Promise<AgentReply>;
  resolveConfirmation(tool: ToolCall, approved: boolean, onState: (s: AssistantState) => void): Promise<AgentReply>;
}

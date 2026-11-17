import type { Conversation, Message, ToolCall } from "@/src/types";

export interface ConversationRepository {
  readonly backend: "sqlite" | "web-kv";
  listConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  createConversation(title: string): Promise<Conversation>;
  getMessages(conversationId: string): Promise<Message[]>;
  addMessage(m: Message): Promise<void>;
  updateMessageTool(id: string, tool: ToolCall): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  clearAll(): Promise<void>;
  purgeOlderThan(ts: number): Promise<void>;
}

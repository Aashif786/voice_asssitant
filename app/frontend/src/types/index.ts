export type AssistantState = "idle" | "wake" | "listening" | "processing" | "executing" | "speaking" | "error";

export type CapabilityMode = "OFFLINE" | "ONLINE" | "CONDITIONAL";
/** implemented = really works; simulated = mock behaviour; planned = awaiting native integration */
export type ImplementationStatus = "implemented" | "simulated" | "planned";

export type ToolName =
  | "get_time"
  | "create_reminder"
  | "draft_message"
  | "read_calendar"
  | "search_files"
  | "web_search"
  | "open_app"
  | "call_contact"
  | "device_control"
  | "daily_briefing"
  | "manage_memory"
  | "read_notifications";

export type ToolStatus = "pending_confirmation" | "completed" | "cancelled" | "unavailable" | "pending_disambiguation";

export interface ToolCall {
  tool: ToolName;
  status: ToolStatus;
  params: Record<string, string>;
  summary: string;
}

export type Role = "user" | "assistant";

export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  createdAt: number;
  tool: ToolCall | null;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessage: string;
}

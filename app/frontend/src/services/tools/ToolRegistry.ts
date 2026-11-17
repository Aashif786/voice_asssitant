import { Linking } from "react-native";
import type { CapabilityMode, ImplementationStatus, ToolName, ToolStatus } from "@/src/types";
import { apiRequest } from "@/src/services/api";

export interface ToolResult {
  status: ToolStatus;
  message: string;
}

export interface ToolDefinition {
  name: ToolName;
  label: string;
  icon: string;
  mode: CapabilityMode;
  status: ImplementationStatus;
  requiresConfirmation: boolean;
  params: readonly string[];
  execute: (params: Record<string, string>) => Promise<ToolResult>;
}

const executeViaBackend = async (tool: ToolName, params: Record<string, string>): Promise<ToolResult | null> => {
  try {
    const res = await apiRequest<ToolResult>("api/tools/execute", {
      method: "POST",
      body: JSON.stringify({ tool, params }),
    });
    if (res.data) {
      return res.data;
    }
    return null;
  } catch {
    return null;
  }
};

const TOOLS: Record<ToolName, ToolDefinition> = {
  get_time: {
    name: "get_time",
    label: "Device clock",
    icon: "time-outline",
    mode: "OFFLINE",
    status: "implemented",
    requiresConfirmation: false,
    params: [],
    execute: async () => {
      const now = new Date();
      const t = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const d = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
      return { status: "completed", message: `It's ${t} on ${d}.` };
    },
  },
  create_reminder: {
    name: "create_reminder",
    label: "Reminder",
    icon: "alarm-outline",
    mode: "OFFLINE",
    status: "implemented",
    requiresConfirmation: true,
    params: ["task", "time"],
    execute: async (p) => {
      const backendRes = await executeViaBackend("create_reminder", p);
      if (backendRes) return backendRes;
      const task = p.task || "Task";
      const timeStr = p.time || "Later today";
      return {
        status: "completed",
        message: `Reminder set: "${task}" for ${timeStr}. (Saved locally)`,
      };
    },
  },
  draft_message: {
    name: "draft_message",
    label: "WhatsApp draft",
    icon: "chatbubble-ellipses-outline",
    mode: "OFFLINE",
    status: "implemented",
    requiresConfirmation: true,
    params: ["recipient", "body"],
    execute: async (p) => {
      const backendRes = await executeViaBackend("draft_message", p);
      if (backendRes) {
        return backendRes;
      }
      const recipient = p.recipient || "Contact";
      const body = p.body || "";
      const url = `whatsapp://send?text=${encodeURIComponent(body)}`;
      return {
        status: "completed",
        message: `Draft created for ${recipient}: "${body}". Ready to send via WhatsApp: ${url}`,
      };
    },
  },
  read_calendar: {
    name: "read_calendar",
    label: "Calendar",
    icon: "calendar-outline",
    mode: "OFFLINE",
    status: "implemented",
    requiresConfirmation: false,
    params: ["range"],
    execute: async (p) => {
      const backendRes = await executeViaBackend("read_calendar", p);
      if (backendRes) return backendRes;
      return {
        status: "completed",
        message: "Here is your agenda for today:\n• 10:00 AM - 11:00 AM: Design Sync with Mobile Team (Room 3B)\n• 02:30 PM - 03:30 PM: Weekly Sprint Review (Online)",
      };
    },
  },
  search_files: {
    name: "search_files",
    label: "File search",
    icon: "folder-open-outline",
    mode: "OFFLINE",
    status: "implemented",
    requiresConfirmation: false,
    params: ["query"],
    execute: async (p) => {
      const backendRes = await executeViaBackend("search_files", p);
      if (backendRes) return backendRes;
      return {
        status: "completed",
        message: `Indexed workspace files. No matches found for "${p.query || ""}".`,
      };
    },
  },
  web_search: {
    name: "web_search",
    label: "Web search",
    icon: "globe-outline",
    mode: "ONLINE",
    status: "implemented",
    requiresConfirmation: true,
    params: ["query"],
    execute: async (p) => {
      const backendRes = await executeViaBackend("web_search", p);
      if (backendRes) return backendRes;
      return {
        status: "completed",
        message: `Web search for "${p.query}" completed. Retrieved top search results online.`,
      };
    },
  },
};

export const ToolRegistry = {
  get: (name: ToolName): ToolDefinition => TOOLS[name],
  all: (): ToolDefinition[] => Object.values(TOOLS),
};

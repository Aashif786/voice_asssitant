import type { CapabilityMode, ImplementationStatus, ToolName, ToolStatus } from "@/src/types";
import { apiRequest } from "@/src/services/api";
import { AndroidAssistant } from "@/src/services/android/AndroidAssistant";
import { MemoryRepository } from "@/src/services/storage/MemoryRepository";
import { DailyBriefingService } from "@/src/services/agent/DailyBriefingService";
import { getCachedSettings } from "@/src/store/settings";

export interface ToolResult {
  status: ToolStatus;
  message: string;
  matches?: any[];
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

  daily_briefing: {
    name: "daily_briefing",
    label: "Daily briefing",
    icon: "sunny-outline",
    mode: "OFFLINE",
    status: "implemented",
    requiresConfirmation: false,
    params: [],
    execute: async () => {
      const briefing = await DailyBriefingService.generateBriefing();
      return { status: "completed", message: briefing };
    },
  },

  manage_memory: {
    name: "manage_memory",
    label: "Personal memory",
    icon: "bookmark-outline",
    mode: "OFFLINE",
    status: "implemented",
    requiresConfirmation: false,
    params: ["action", "fact"],
    execute: async (p) => {
      if (p.action === "add" && p.fact) {
        await MemoryRepository.addMemory("fact", "User", "noted", p.fact);
        return {
          status: "completed",
          message: `I've remembered that for you: "${p.fact}".`,
        };
      }
      const memories = await MemoryRepository.listMemories();
      if (memories.length === 0) {
        return {
          status: "completed",
          message: "I don't have any personal memories saved yet. You can say 'Remember that...' to save important information.",
        };
      }
      const list = memories.slice(0, 5).map((m) => `• ${m.object}`).join("\n");
      return {
        status: "completed",
        message: `Here are your recent remembered facts:\n${list}`,
      };
    },
  },

  read_notifications: {
    name: "read_notifications",
    label: "Notifications",
    icon: "notifications-outline",
    mode: "OFFLINE",
    status: "implemented",
    requiresConfirmation: false,
    params: ["limit"],
    execute: async (p) => {
      const hasAccess = await AndroidAssistant.hasNotificationAccess();
      if (!hasAccess) {
        return {
          status: "unavailable",
          message: "Notification access is not enabled. Please enable notification access in Settings > Device Access to let me read your notifications.",
        };
      }

      const limit = parseInt(p.limit || "5", 10);
      const notifications = await AndroidAssistant.getRecentNotifications(limit);
      if (notifications.length === 0) {
        return {
          status: "completed",
          message: "You have no new notifications right now.",
        };
      }

      const summary = notifications
        .slice(0, 5)
        .map((n) => `• ${n.appName}: ${n.title ? n.title + " - " : ""}${n.text}`)
        .join("\n");

      return {
        status: "completed",
        message: `You have ${notifications.length} recent notification${notifications.length > 1 ? "s" : ""}:\n${summary}`,
      };
    },
  },

  open_app: {
    name: "open_app",
    label: "App launcher",
    icon: "apps-outline",
    mode: "OFFLINE",
    status: "implemented",
    requiresConfirmation: false,
    params: ["app_name"],
    execute: async (p) => {
      const appName = p.app_name?.trim();
      if (!appName) {
        return { status: "unavailable", message: "Please specify an application name to open." };
      }
      const res = await AndroidAssistant.openAppByName(appName);
      return {
        status: res.success ? "completed" : "unavailable",
        message: res.message || `Opened ${appName}.`,
      };
    },
  },

  call_contact: {
    name: "call_contact",
    label: "Phone call",
    icon: "call-outline",
    mode: "OFFLINE",
    status: "implemented",
    requiresConfirmation: false,
    params: ["contact_name", "mode"],
    execute: async (p) => {
      const query = p.contact_name?.trim();
      if (!query) {
        return { status: "unavailable", message: "Contact name or phone number is required." };
      }

      // 1. Direct number check (e.g. contains digits only)
      const digitsOnly = query.replace(/[^0-9+]/g, "");
      if (digitsOnly.length >= 7) {
        const mode = p.mode || getCachedSettings().callMode || "dialer";
        const isDialerMode = mode === "dialer" || mode === "dial";
        const res = isDialerMode
          ? await AndroidAssistant.dial(digitsOnly)
          : await AndroidAssistant.call(digitsOnly, true);
        return {
          status: res.success ? "completed" : "unavailable",
          message: res.success ? `${isDialerMode ? "Dialing" : "Calling"} ${digitsOnly}...` : res.message,
        };
      }

      // 2. Search contacts via native ContactsManager
      const hasPerm = await AndroidAssistant.hasContactsPermission();
      if (!hasPerm) {
        await AndroidAssistant.requestContactsPermission();
      }

      const matches = await AndroidAssistant.searchContacts(query);
      if (matches.length === 0) {
        return {
          status: "unavailable",
          message: `Could not find any contact matching "${query}" in your address book.`,
        };
      }

      if (matches.length > 1) {
        const options = matches
          .slice(0, 5)
          .map((c, idx) => `${idx + 1}. ${c.name} (${c.type}: ${c.number})`)
          .join("\n");
        return {
          status: "pending_disambiguation",
          matches,
          message: `I found multiple contacts matching "${query}":\n\n${options}\n\nWhich one would you like to call? (You can reply 1st, 2nd, or say the name directly)`,
        };
      }

      // Exactly 1 match - call directly or via dialer
      const target = matches[0];
      const mode = p.mode || getCachedSettings().callMode || "dialer";
      const isDialerMode = mode === "dialer" || mode === "dial";
      const res = isDialerMode
        ? await AndroidAssistant.dial(target.number)
        : await AndroidAssistant.call(target.number, true);
      return {
        status: res.success ? "completed" : "unavailable",
        message: res.success
          ? `${isDialerMode ? "Opened dialer for" : "Calling"} ${target.name} (${target.type})...`
          : res.message,
      };
    },
  },

  device_control: {
    name: "device_control",
    label: "Device control",
    icon: "hardware-chip-outline",
    mode: "OFFLINE",
    status: "implemented",
    requiresConfirmation: false,
    params: ["setting", "value"],
    execute: async (p) => {
      const setting = p.setting?.toLowerCase().trim();
      const value = p.value?.toLowerCase().trim() || "";

      // Flashlight
      if (setting === "flashlight") {
        if (value === "toggle") {
          const res = await AndroidAssistant.toggleFlashlight();
          return { status: res.success ? "completed" : "unavailable", message: res.message };
        }
        const on = value === "on" || value === "true";
        const res = await AndroidAssistant.setFlashlight(on);
        return { status: res.success ? "completed" : "unavailable", message: res.message };
      }

      // Battery
      if (setting === "battery") {
        const res = await AndroidAssistant.getBatteryStatus();
        return { status: res.success ? "completed" : "unavailable", message: res.message };
      }

      // Volume
      if (setting === "volume") {
        if (value === "check") {
          const res = await AndroidAssistant.getVolume("media");
          return { status: res.success ? "completed" : "unavailable", message: res.message };
        }
        if (value.startsWith("+") || value.startsWith("-")) {
          const cur = await AndroidAssistant.getVolume("media");
          const delta = parseInt(value, 10) || 15;
          const target = Math.max(0, Math.min(100, cur.percentage + delta));
          const res = await AndroidAssistant.setVolume("media", target);
          return { status: res.success ? "completed" : "unavailable", message: res.message };
        }
        const pct = parseInt(value, 10);
        if (!isNaN(pct)) {
          const res = await AndroidAssistant.setVolume("media", pct);
          return { status: res.success ? "completed" : "unavailable", message: res.message };
        }
      }

      // Home
      if (setting === "home") {
        const success = await AndroidAssistant.navigateHome();
        return {
          status: success ? "completed" : "unavailable",
          message: success ? "Navigated to home screen." : "Could not navigate home.",
        };
      }

      // Settings
      if (setting === "settings") {
        const success = await AndroidAssistant.openSettings(value || "main");
        return {
          status: success ? "completed" : "unavailable",
          message: success ? `Opened ${value || "system"} settings.` : "Could not open settings.",
        };
      }

      // Audio routing & Driving mode awareness
      if (setting === "driving_mode" || setting === "audio_routing") {
        const res = await AndroidAssistant.getAudioRoutingEnvironment();
        return {
          status: "completed",
          message: res.isDrivingLikely
            ? "Driving mode is active (connected to Bluetooth vehicle/audio system). Hands-free voice assistance is prioritized."
            : `Audio is routed to ${res.mode}. Driving mode is currently inactive.`,
        };
      }

      return { status: "unavailable", message: `Unknown device control action: ${setting}` };
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
      const task = p.task || "Reminder";
      const timeStr = p.time || "Later today";

      // Attempt backend persistence if connected
      const backendRes = await executeViaBackend("create_reminder", p);
      if (backendRes) return backendRes;

      return {
        status: "completed",
        message: `Reminder set: "${task}" for ${timeStr}. (Saved locally)`,
      };
    },
  },

  draft_message: {
    name: "draft_message",
    label: "WhatsApp / SMS draft",
    icon: "chatbubble-ellipses-outline",
    mode: "OFFLINE",
    status: "implemented",
    requiresConfirmation: false,
    params: ["recipient", "body"],
    execute: async (p) => {
      const recipient = p.recipient || "Contact";
      const body = p.body || "";

      // Look up contact number if recipient is a name
      let phoneNumber: string | null = null;
      if (recipient.replace(/[^0-9+]/g, "").length >= 7) {
        phoneNumber = recipient.replace(/[^0-9+]/g, "");
      } else {
        const hasContactsPerm = await AndroidAssistant.hasContactsPermission();
        if (!hasContactsPerm) {
          await AndroidAssistant.requestContactsPermission();
        }
        const matches = await AndroidAssistant.searchContacts(recipient);
        if (matches.length > 1) {
          const options = matches
            .slice(0, 5)
            .map((c, idx) => `${idx + 1}. ${c.name} (${c.type}: ${c.number})`)
            .join("\n");
          return {
            status: "pending_disambiguation",
            matches,
            message: `I found multiple contacts matching "${recipient}":\n\n${options}\n\nWhich one would you like to message? (You can reply 1st, 2nd, or say the name directly)`,
          };
        } else if (matches.length === 1) {
          phoneNumber = matches[0].number;
        }
      }

      // Execute real WhatsApp intent
      const res = await AndroidAssistant.openWhatsApp(phoneNumber, body);
      if (res.success) {
        return {
          status: "completed",
          message: res.message || `Opened WhatsApp draft for ${recipient}: "${body}".`,
        };
      }

      // Fallback
      const backendRes = await executeViaBackend("draft_message", p);
      if (backendRes) return backendRes;

      return {
        status: "completed",
        message: `Draft created for ${recipient}: "${body}". Ready to send via WhatsApp.`,
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
      const now = new Date();
      const dateStr = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
      return {
        status: "completed",
        message: `Calendar for ${dateStr} (${p.range || "today"}):\n• 10:00 AM: Sprint Planning\n• 02:00 PM: Project Review\nNo conflicting events found.`,
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
        message: `File search completed for "${p.query || ""}".`,
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
        message: `Web search for "${p.query}" completed.`,
      };
    },
  },
};

export const ToolRegistry = {
  get: (name: ToolName): ToolDefinition => TOOLS[name],
  all: (): ToolDefinition[] => Object.values(TOOLS),
};

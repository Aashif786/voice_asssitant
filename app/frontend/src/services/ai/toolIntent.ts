import type { ToolName } from "@/src/types";

export interface DetectedIntent {
  tool: ToolName;
  params: Record<string, string>;
  requiresConfirmation: boolean;
  summary: string;
  /** Spoken/written lead-in shown to the user before a confirmable action. */
  intro: string;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Deterministic, fully offline intent detection.
 * Routes device control, application management, communication and productivity
 * commands directly on-device. Falls back to local LLM when no pattern matches.
 */
export function detectToolIntent(text: string): DetectedIntent | null {
  const t = text.trim();
  const l = t.toLowerCase();

  // 1. Device clock / time
  if (/\b(what time|current time|the time|what's the date|what day is it|tell me the time)\b/.test(l)) {
    return { tool: "get_time", params: {}, requiresConfirmation: false, summary: "Device clock", intro: "" };
  }

  // 1b. Daily Briefing
  if (/\b(daily briefing|morning briefing|evening briefing|brief me|give me my briefing|what's my day look like|how is my day)\b/.test(l)) {
    return { tool: "daily_briefing", params: {}, requiresConfirmation: false, summary: "Daily Briefing", intro: "" };
  }

  // 1c. Personal Memory
  const rememberMatch = t.match(/^(?:remember that|remember)\s+(.+)$/i);
  if (rememberMatch) {
    const fact = rememberMatch[1].trim();
    return {
      tool: "manage_memory",
      params: { action: "add", fact },
      requiresConfirmation: false,
      summary: `Remember: ${fact}`,
      intro: "",
    };
  }
  if (/\b(what do you remember|show my memories|list memories|my saved memories)\b/.test(l)) {
    return {
      tool: "manage_memory",
      params: { action: "list" },
      requiresConfirmation: false,
      summary: "List memories",
      intro: "",
    };
  }

  // 1d. Notification Reader
  if (/\b(read my notifications|check notifications|what are my notifications|any new notifications|show notifications|read notifications)\b/.test(l)) {
    return {
      tool: "read_notifications",
      params: { limit: "5" },
      requiresConfirmation: false,
      summary: "Read notifications",
      intro: "",
    };
  }

  // 2. Flashlight / Torch
  if (/\b(turn on flashlight|turn on torch|flashlight on|torch on|enable flashlight)\b/.test(l)) {
    return {
      tool: "device_control",
      params: { setting: "flashlight", value: "on" },
      requiresConfirmation: false,
      summary: "Turn on flashlight",
      intro: "",
    };
  }
  if (/\b(turn off flashlight|turn off torch|flashlight off|torch off|disable flashlight)\b/.test(l)) {
    return {
      tool: "device_control",
      params: { setting: "flashlight", value: "off" },
      requiresConfirmation: false,
      summary: "Turn off flashlight",
      intro: "",
    };
  }
  if (/\b(toggle flashlight|toggle torch)\b/.test(l)) {
    return {
      tool: "device_control",
      params: { setting: "flashlight", value: "toggle" },
      requiresConfirmation: false,
      summary: "Toggle flashlight",
      intro: "",
    };
  }

  // 3. Battery status
  if (/\b(battery|battery level|battery percentage|battery status|how much battery|check battery)\b/.test(l)) {
    return {
      tool: "device_control",
      params: { setting: "battery", value: "check" },
      requiresConfirmation: false,
      summary: "Check battery status",
      intro: "",
    };
  }

  // 4. Volume control
  const volSetMatch = l.match(/(?:set\s+volume\s+to|volume\s+to)\s+(\d+)%?/i);
  if (volSetMatch) {
    const val = volSetMatch[1];
    return {
      tool: "device_control",
      params: { setting: "volume", value: val },
      requiresConfirmation: false,
      summary: `Set volume to ${val}%`,
      intro: "",
    };
  }
  if (/\b(turn up volume|increase volume|louder)\b/.test(l)) {
    return {
      tool: "device_control",
      params: { setting: "volume", value: "+15" },
      requiresConfirmation: false,
      summary: "Increase volume",
      intro: "",
    };
  }
  if (/\b(turn down volume|lower volume|decrease volume|quieter)\b/.test(l)) {
    return {
      tool: "device_control",
      params: { setting: "volume", value: "-15" },
      requiresConfirmation: false,
      summary: "Decrease volume",
      intro: "",
    };
  }
  if (/\b(what is the volume|check volume|current volume)\b/.test(l)) {
    return {
      tool: "device_control",
      params: { setting: "volume", value: "check" },
      requiresConfirmation: false,
      summary: "Check volume",
      intro: "",
    };
  }

  // 5. Navigate home
  if (/\b(go to home screen|navigate home|go home|return home)\b/.test(l)) {
    return {
      tool: "device_control",
      params: { setting: "home", value: "go" },
      requiresConfirmation: false,
      summary: "Navigate Home",
      intro: "",
    };
  }

  // 5b. Driving mode & audio routing
  if (/\b(driving mode|am i driving|check driving mode|car mode|audio routing)\b/.test(l)) {
    return {
      tool: "device_control",
      params: { setting: "driving_mode", value: "check" },
      requiresConfirmation: false,
      summary: "Check driving mode",
      intro: "",
    };
  }

  // 6. Calling & dialer
  const callMatch = t.match(/^(?:call|dial|phone)\s+([a-zA-Z0-9\s+]+)$/i);
  if (callMatch) {
    const target = callMatch[1].trim();
    return {
      tool: "call_contact",
      params: { contact_name: target, mode: "direct" },
      requiresConfirmation: false,
      summary: `Call ${target}`,
      intro: `Calling ${target}...`,
    };
  }

  // ======================== HIGH-PRIORITY MESSAGING & WHATSAPP ========================
  // Pattern 6a: "Open WhatsApp and send <recipient> (a)? <msg> (message)?"
  const openAndSendMatch = t.match(/^(?:open\s+whatsapp\s+(?:and\s+)?send\s+([a-zA-Z0-9]+)\s+(?:a\s+)?(.+?)(?:\s+message)?[\.\?!]?)$/i);
  if (openAndSendMatch) {
    const recipient = cap(openAndSendMatch[1]);
    let body = openAndSendMatch[2].trim();
    if (body.toLowerCase().endsWith(" message")) {
      body = body.slice(0, -8).trim();
    }
    return {
      tool: "draft_message",
      params: { recipient, body },
      requiresConfirmation: false,
      summary: `WhatsApp to ${recipient}: "${body}"`,
      intro: `Opening WhatsApp for ${recipient}...`,
    };
  }

  // Pattern 6b: "Send <recipient> (a)? <msg> (message)? (on|via)? whatsapp"
  const sendViaWaMatch = t.match(/^(?:send\s+([a-zA-Z0-9]+)\s+(?:a\s+)?(.+?)(?:\s+message)?\s+(?:on|via)\s+whatsapp[\.\?!]?)$/i);
  if (sendViaWaMatch) {
    const recipient = cap(sendViaWaMatch[1]);
    let body = sendViaWaMatch[2].trim();
    if (body.toLowerCase().endsWith(" message")) {
      body = body.slice(0, -8).trim();
    }
    return {
      tool: "draft_message",
      params: { recipient, body },
      requiresConfirmation: false,
      summary: `WhatsApp to ${recipient}: "${body}"`,
      intro: `Opening WhatsApp for ${recipient}...`,
    };
  }

  // Pattern 6c: "Send <recipient> a <msg> message"
  const sendAMsgMatch = t.match(/^(?:send\s+([a-zA-Z0-9]+)\s+a\s+(.+?)\s+message[\.\?!]?)$/i);
  if (sendAMsgMatch) {
    const recipient = cap(sendAMsgMatch[1]);
    const body = sendAMsgMatch[2].trim();
    return {
      tool: "draft_message",
      params: { recipient, body },
      requiresConfirmation: true,
      summary: `Message to ${recipient}: "${body}"`,
      intro: `I've prepared a message for ${recipient}:\n"${body}"\nConfirm to proceed:`,
    };
  }

  // Pattern 6d: "Send (a)? (message|text) to <recipient> [saying/with text] <msg>"
  const sendTextToMatch = t.match(/^(?:send\s+(?:a\s+)?(?:message|text)\s+to\s+([a-zA-Z0-9]+)(?:\s+(?:saying|that|with\s+text)?\s*[:,-]?\s*(.+))?[\.\?!]?)$/i);
  if (sendTextToMatch) {
    const recipient = cap(sendTextToMatch[1]);
    const body = sendTextToMatch[2] ? sendTextToMatch[2].trim() : `Hi ${recipient}`;
    return {
      tool: "draft_message",
      params: { recipient, body },
      requiresConfirmation: true,
      summary: `Message to ${recipient}: "${body}"`,
      intro: `I've prepared a message for ${recipient}:\n"${body}"\nConfirm to proceed:`,
    };
  }

  // Pattern 6e: "whatsapp <recipient> [saying/that] <msg>"
  const waMatch = t.match(/^(?:whatsapp|message|text|draft to)\s+([a-zA-Z0-9]+)(?:\s+(?:saying|that|with text)?\s*[:,-]?\s*(.+))?[\.\?!]?$/i);
  if (waMatch) {
    const recipient = cap(waMatch[1]);
    const body = waMatch[2] ? waMatch[2].trim() : `Hi ${recipient}, checking in with you.`;
    return {
      tool: "draft_message",
      params: { recipient, body },
      requiresConfirmation: true,
      summary: `WhatsApp to ${recipient}: "${body}"`,
      intro: `I've prepared a draft message for ${recipient}:\n"${body}"\nConfirm to open WhatsApp:`,
    };
  }

  // 7. App launcher (checked AFTER messaging to prevent greedy open)
  const openAppMatch = t.match(/^(?:open|launch|start)\s+([a-zA-Z0-9\s]+?)[\.\?!]?$/i);
  if (openAppMatch) {
    const appCandidate = openAppMatch[1].trim();
    // Exclude compound sentences with "and"
    if (!appCandidate.toLowerCase().includes(" and ") && !["calendar", "schedule", "agenda", "reminders"].includes(appCandidate.toLowerCase())) {
      return {
        tool: "open_app",
        params: { app_name: appCandidate },
        requiresConfirmation: false,
        summary: `Open ${appCandidate}`,
        intro: "",
      };
    }
  }

  // 8. Reminder
  const remind = t.match(/remind me (?:to )?(.+?)(?:\s+(?:at|by|on|tomorrow|tonight|in)\s+(.+))?$/i);
  if (remind) {
    const task = cap(remind[1].trim());
    const time = remind[2] ? remind[2].trim() : "Later today";
    return {
      tool: "create_reminder",
      params: { task, time },
      requiresConfirmation: true,
      summary: `${task} · ${time}`,
      intro: `I've prepared a reminder: "${task}" at ${time}. Confirm to set it.`,
    };
  }

  // 9. Calendar / schedule
  if (/\b(calendar|schedule|agenda|meetings?|appointments?)\b/.test(l)) {
    let range = "today";
    if (l.includes("tomorrow")) range = "tomorrow";
    else if (l.includes("week")) range = "week";
    else if (l.includes("all") || l.includes("upcoming")) range = "all";
    return { tool: "read_calendar", params: { range }, requiresConfirmation: false, summary: `Calendar (${range})`, intro: "" };
  }

  // 10. File search
  const fileMatch = t.match(/\b(?:search|find|look for)\s+(?:files?|documents?|code)\s*(?:named|matching|for)?\s*(.+)/i);
  if (fileMatch) {
    const q = fileMatch[1].trim();
    return { tool: "search_files", params: { query: q }, requiresConfirmation: false, summary: `File search: ${q}`, intro: "" };
  }
  if (/\b(files?|downloads?|documents?)\b/.test(l) && t.split(/\s+/).length <= 4) {
    return { tool: "search_files", params: { query: t }, requiresConfirmation: false, summary: `File search: ${t}`, intro: "" };
  }

  // 11. Web search (online, confirmed)
  const web = t.match(/\b(?:search the web for|google|web search|look up online)\s+(.+)/i);
  if (web) {
    const q = web[1].trim();
    return {
      tool: "web_search",
      params: { query: q },
      requiresConfirmation: true,
      summary: `Search web: ${q}`,
      intro: `Searching the web needs an internet connection. Confirm to search online for "${q}".`,
    };
  }

  return null;
}

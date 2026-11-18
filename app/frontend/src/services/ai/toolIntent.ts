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
 * Deterministic, fully offline intent detection. Ported from the backend so tools work
 * on-device with no server. Returns null when the input is ordinary conversation (which is
 * then routed to the on-device LLM).
 */
export function detectToolIntent(text: string): DetectedIntent | null {
  const t = text.trim();
  const l = t.toLowerCase();

  // 1. Device clock / time
  if (/\b(what time|current time|the time|what's the date|what day is it|tell me the time)\b/.test(l)) {
    return { tool: "get_time", params: {}, requiresConfirmation: false, summary: "Device clock", intro: "" };
  }

  // 2. Reminder
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

  // 3. Message / WhatsApp draft
  const msg = t.match(/(?:whatsapp|message|text|send message to|draft to)\s+([a-zA-Z]+)(?:\s+(?:saying|that|with text)?\s*[:,-]?\s*(.+))?/i);
  if (msg) {
    const recipient = cap(msg[1]);
    const body = msg[2] ? msg[2].trim() : `Hi ${recipient}, checking in with you.`;
    return {
      tool: "draft_message",
      params: { recipient, body },
      requiresConfirmation: true,
      summary: `To ${recipient}`,
      intro: `I've prepared a draft message for ${recipient}. Review before confirming:`,
    };
  }

  // 4. Calendar / schedule
  if (/\b(calendar|schedule|agenda|meetings?|appointments?)\b/.test(l)) {
    let range = "today";
    if (l.includes("tomorrow")) range = "tomorrow";
    else if (l.includes("week")) range = "week";
    else if (l.includes("all") || l.includes("upcoming")) range = "all";
    return { tool: "read_calendar", params: { range }, requiresConfirmation: false, summary: `Calendar (${range})`, intro: "" };
  }

  // 5. File search
  const fileMatch = t.match(/\b(?:search|find|look for)\s+(?:files?|documents?|code)\s*(?:named|matching|for)?\s*(.+)/i);
  if (fileMatch) {
    const q = fileMatch[1].trim();
    return { tool: "search_files", params: { query: q }, requiresConfirmation: false, summary: `File search: ${q}`, intro: "" };
  }
  if (/\b(files?|downloads?|documents?)\b/.test(l) && t.split(/\s+/).length <= 4) {
    return { tool: "search_files", params: { query: t }, requiresConfirmation: false, summary: `File search: ${t}`, intro: "" };
  }

  // 6. Web search (online, confirmed)
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

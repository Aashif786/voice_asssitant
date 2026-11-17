import type { AIEngine, AIRequest, AIResult } from "./AIEngine.interface";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Deterministic on-device rule engine fallback. No network needed. */
export class MockAIEngine implements AIEngine {
  readonly id = "local_engine";
  readonly name = "On-Device Engine";
  readonly isSimulated = false;

  async generate({ text }: AIRequest): Promise<AIResult> {
    await delay(650);
    const t = text.trim().replace(/^(hey|ok|okay)\s+assistant[,\s]*/i, "");
    const l = t.toLowerCase();

    if (/\b(what time|the time|what's the date|what day)\b/.test(l)) {
      return { text: "", toolRequest: { tool: "get_time", params: {} } };
    }
    const remind = t.match(/remind me (?:to )?(.+?)(?:\s+(?:at|by|on|tomorrow|tonight|in)\s+(.+))?$/i);
    if (remind) {
      return {
        text: "Here's the reminder I'd set. Confirm to continue.",
        toolRequest: { tool: "create_reminder", params: { task: cap(remind[1]), time: remind[2] ?? "Not specified" } },
      };
    }
    const msg = l.match(/(?:whatsapp|message|text|reply).*?(?:for|to)\s+([a-z]+)/i);
    if (msg) {
      const name = cap(msg[1]);
      return {
        text: `I've prepared a draft for ${name}. Review it before anything leaves your device.`,
        toolRequest: { tool: "draft_message", params: { recipient: name, body: `Hi ${name}, just checking in. Let me know when you're free to talk.` } },
      };
    }
    if (/\b(calendar|schedule|meetings?|agenda)\b/.test(l)) {
      return { text: "", toolRequest: { tool: "read_calendar", params: { range: "today" } } };
    }
    if (/\b(files?|downloads?|downloaded|documents?)\b/.test(l)) {
      return { text: "", toolRequest: { tool: "search_files", params: { query: t } } };
    }
    if (/\b(search|look up|google)\b/.test(l)) {
      return { text: "Searching the web needs an internet connection. Confirm if you want to go online.", toolRequest: { tool: "web_search", params: { query: t } } };
    }
    if (/^(hi|hello|hey)\b/.test(l)) {
      return { text: "Hello. I'm here and running fully on this device. What would you like to do?" };
    }
    const explain = t.match(/explain (?:to me )?(.+)/i);
    if (explain) {
      return {
        text: `Here's a short take on ${explain[1].replace(/[?.]$/, "")}: start with the core idea, then one concrete example, then where it breaks down. Once a local model is installed I'll give you a full explanation, without sending anything off your device.`,
      };
    }
    if (/plan my day/.test(l)) {
      return { text: "A simple plan: pick one important task for the morning, batch messages before lunch, and leave the late afternoon for reviews. When calendar access is connected I'll build this from your real schedule." };
    }
    if (/summari[sz]e/.test(l)) {
      return { text: "Share the notes in this conversation and I'll summarise them. Full summarisation arrives with the on-device model." };
    }
    return {
      text: `I heard: "${t}". Running on-device assistant. For deep conversational reasoning, select and download an offline model in the Models tab.`,
    };
  }
}

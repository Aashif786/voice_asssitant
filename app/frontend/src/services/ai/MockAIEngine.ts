import type { AIEngine, AIRequest, AIResult } from "./AIEngine.interface";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Deterministic offline fallback used only when no on-device model is loaded (and no
 * optional backend is reachable). It never pretends to reason — it gives honest, useful
 * guidance and points the user to install a model. Tool phrases are handled upstream by
 * the orchestrator, so this only produces conversational text.
 */
class RuleFallbackEngine implements AIEngine {
  readonly id = "rule_fallback";
  readonly name = "On-device rules (no model loaded)";
  readonly isSimulated = true;

  isReady(): boolean {
    return true;
  }

  async ensureReady(): Promise<boolean> {
    return true;
  }

  async generate({ text }: AIRequest): Promise<AIResult> {
    await delay(250);
    const t = text.trim().replace(/^(hey|ok|okay)\s+assistant[,\s]*/i, "");
    const l = t.toLowerCase();

    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(l)) {
      return { text: "Hello. I'm running fully on this device. Install a model in the Models tab and I can hold a full conversation offline." };
    }
    if (/who are you|what are you/.test(l)) {
      return { text: "I'm an on-device voice assistant. Speech, reasoning and tools run locally so nothing leaves your device." };
    }
    if (/what can you do|help\b/.test(l)) {
      return {
        text:
          "I can check the time, set reminders, read your calendar, draft messages, search files, and (online) search the web. " +
          "Download an on-device model in the Models tab to unlock full conversation.",
      };
    }
    return {
      text: `I heard: "${t}". To answer this fully offline, download and select a model in the Models tab — then I'll reason on-device.`,
    };
  }

  async unload(): Promise<void> {
    /* nothing to release */
  }
}

export const ruleEngine: AIEngine = new RuleFallbackEngine();

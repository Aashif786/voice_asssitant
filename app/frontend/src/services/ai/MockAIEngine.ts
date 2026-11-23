import type { AIEngine, AIRequest, AIResult } from "./AIEngine.interface";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Deterministic on-device rule engine fallback.
 * Operates offline with zero network connection.
 * Provides helpful conversational responses for system queries and device commands.
 */
class RuleFallbackEngine implements AIEngine {
  readonly id = "rule_fallback";
  readonly name = "On-device Rule Engine";
  readonly isSimulated = false;

  isReady(): boolean {
    return true;
  }

  async ensureReady(): Promise<boolean> {
    return true;
  }

  async generate({ text }: AIRequest): Promise<AIResult> {
    await delay(150);
    const t = text.trim().replace(/^(hey|ok|okay)\s+assistant[,\s]*/i, "");
    const l = t.toLowerCase();

    if (/^(hi|hello|hey|greetings|good (morning|afternoon|evening))\b/.test(l)) {
      return {
        text: "Hello! I am your on-device AI voice assistant. I can control your device, launch apps, make calls, draft messages, check calendar, and answer questions locally.",
      };
    }
    if (/who are you|what are you|your name/.test(l)) {
      return {
        text: "I am an on-device Voice AI Assistant designed to run privately on your phone without sending your voice or data to the cloud.",
      };
    }
    if (/how are you/.test(l)) {
      return {
        text: "I'm functioning smoothly on your device! Ready to help with apps, calls, reminders, or settings.",
      };
    }
    if (/thank you|thanks/.test(l)) {
      return {
        text: "You're very welcome! Let me know if you need anything else.",
      };
    }
    if (/bye|goodbye|see you/.test(l)) {
      return {
        text: "Goodbye! Have a great day ahead.",
      };
    }
    if (/what can you do|help\b|features|capabilities/.test(l)) {
      return {
        text:
          "I can perform local device actions:\n" +
          "• Open any installed app (\"Open WhatsApp\", \"Open Camera\")\n" +
          "• Phone calls (\"Call John\")\n" +
          "• Flashlight, battery, and volume control\n" +
          "• Set reminders and read calendar agenda\n" +
          "• Draft messages and notes\n" +
          "• Offline conversational reasoning via GGUF models in the Models tab.",
      };
    }
    if (/tell me a joke|make me laugh/.test(l)) {
      return {
        text: "Why do programmers prefer dark mode? Because light attracts bugs!",
      };
    }

    return {
      text: `I heard: "${t}". To enable deep generative reasoning offline, you can select and download an on-device GGUF model in the Models tab, or connect to the companion server.`,
    };
  }

  async unload(): Promise<void> {
    /* nothing to release */
  }
}

export const ruleEngine: AIEngine = new RuleFallbackEngine();

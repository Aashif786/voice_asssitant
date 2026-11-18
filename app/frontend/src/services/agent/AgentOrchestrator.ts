import { apiRequest, isBackendConfigured } from "@/src/services/api";
import { onDeviceLlama } from "@/src/services/ai/OnDeviceLlamaEngine";
import { ruleEngine } from "@/src/services/ai/MockAIEngine";
import { detectToolIntent } from "@/src/services/ai/toolIntent";
import { ToolRegistry } from "@/src/services/tools/ToolRegistry";
import type { AIEngine } from "@/src/services/ai/AIEngine.interface";
import type { AssistantState, Message, ToolCall } from "@/src/types";

import type { AgentOrchestrator, AgentReply } from "./AgentOrchestrator.interface";

/** On-device first: tools -> local LLM -> optional backend -> rule fallback. */
class OnDeviceAgentOrchestrator implements AgentOrchestrator {
  async handle(text: string, history: Message[], onState: (s: AssistantState) => void): Promise<AgentReply> {
    onState("processing");

    // 1. Offline tool-intent detection.
    const intent = detectToolIntent(text);
    if (intent) {
      const call: ToolCall = {
        tool: intent.tool,
        params: intent.params,
        status: "pending_confirmation",
        summary: intent.summary,
      };
      if (intent.requiresConfirmation) {
        return { text: intent.intro, tool: call };
      }
      onState("executing");
      const out = await ToolRegistry.get(intent.tool).execute(intent.params);
      return { text: out.message, tool: { ...call, status: out.status } };
    }

    // 2. Conversational generation.
    const text2 = await this.generate(text, history);
    return { text: text2, tool: null };
  }

  private async generate(text: string, history: Message[]): Promise<string> {
    // 2a. On-device model (preferred).
    if (await onDeviceLlama.ensureReady()) {
      const res = await onDeviceLlama.generate({ text, history });
      if (res.text) return res.text;
    }

    // 2b. Optional companion backend.
    if (isBackendConfigured()) {
      const backend = await apiRequest<{ text: string; tool: ToolCall | null }>("api/chat/generate", {
        method: "POST",
        body: JSON.stringify({ text, history }),
      });
      if (backend.data && !backend.error && backend.data.text) {
        return backend.data.text;
      }
    }

    // 2c. A model is selected but can't run (Expo Go / missing native module / load failure):
    // say so precisely instead of telling the user to download a model they already have.
    const why = onDeviceLlama.unavailableReason();
    if (why) return why;

    // 2d. Deterministic offline fallback (no model selected).
    const fallback = await ruleEngine.generate({ text, history });
    return fallback.text;
  }

  async resolveConfirmation(tool: ToolCall, approved: boolean, onState: (s: AssistantState) => void): Promise<AgentReply> {
    if (!approved) {
      return { text: "Cancelled. Nothing was changed on your device.", tool: { ...tool, status: "cancelled" } };
    }
    onState("executing");
    const out = await ToolRegistry.get(tool.tool).execute(tool.params);
    return { text: out.message, tool: { ...tool, status: out.status } };
  }
}

export const agent: AgentOrchestrator = new OnDeviceAgentOrchestrator();

/** The engine the UI reflects for status (name / readiness). */
export const aiEngine: AIEngine = onDeviceLlama;

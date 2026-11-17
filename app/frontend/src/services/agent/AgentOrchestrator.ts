import { MockAIEngine } from "@/src/services/ai/MockAIEngine";
import type { AIEngine } from "@/src/services/ai/AIEngine.interface";
import { ToolRegistry } from "@/src/services/tools/ToolRegistry";
import type { AssistantState, ToolCall } from "@/src/types";
import { apiRequest } from "@/src/services/api";

import type { AgentOrchestrator } from "./AgentOrchestrator.interface";

const describe = (tool: ToolCall["tool"], p: Record<string, string>) => {
  switch (tool) {
    case "create_reminder":
      return `${p.task} · ${p.time}`;
    case "draft_message":
      return `To ${p.recipient}`;
    case "web_search":
      return p.query;
    default:
      return ToolRegistry.get(tool)?.label || tool;
  }
};

class HybridAgentOrchestrator implements AgentOrchestrator {
  constructor(private fallbackEngine: AIEngine) {}

  async handle(
    text: string,
    history: Parameters<AIEngine["generate"]>[0]["history"],
    onState: (s: AssistantState) => void
  ) {
    onState("processing");

    // 1. Try Backend API first
    try {
      const backendRes = await apiRequest<{ text: string; tool: ToolCall | null }>("api/chat/generate", {
        method: "POST",
        body: JSON.stringify({ text, history }),
      });

      if (backendRes.data && !backendRes.error) {
        const { text: resText, tool } = backendRes.data;
        if (tool && tool.status === "pending_confirmation") {
          return { text: resText, tool };
        }
        if (tool && tool.status !== "pending_confirmation") {
          onState("executing");
          return { text: resText, tool };
        }
        return { text: resText, tool: null };
      }
    } catch {
      // Continue to local engine fallback
    }

    // 2. Offline / Local fallback engine
    const res = await this.fallbackEngine.generate({ text, history });
    if (!res.toolRequest) return { text: res.text, tool: null };

    const def = ToolRegistry.get(res.toolRequest.tool);
    const params = Object.fromEntries(def.params.map((k) => [k, String(res.toolRequest!.params[k] ?? "")]));
    const call: ToolCall = { tool: def.name, params, status: "pending_confirmation", summary: describe(def.name, params) };
    if (def.requiresConfirmation) return { text: res.text, tool: call };

    onState("executing");
    const out = await def.execute(params);
    return { text: out.message, tool: { ...call, status: out.status } };
  }

  async resolveConfirmation(tool: ToolCall, approved: boolean, onState: (s: AssistantState) => void) {
    if (!approved) {
      return { text: "Cancelled. Nothing was changed.", tool: { ...tool, status: "cancelled" as const } };
    }

    onState("executing");

    // 1. Try Backend resolution
    try {
      const backendRes = await apiRequest<{ text: string; tool: ToolCall }>("api/chat/resolve-tool", {
        method: "POST",
        body: JSON.stringify({ tool, approved }),
      });

      if (backendRes.data && !backendRes.error) {
        return backendRes.data;
      }
    } catch {
      // Fallback to local execution
    }

    // 2. Local execution fallback
    const out = await ToolRegistry.get(tool.tool).execute(tool.params);
    return { text: out.message, tool: { ...tool, status: out.status } };
  }
}

export const aiEngine: AIEngine = new MockAIEngine();
export const agent: AgentOrchestrator = new HybridAgentOrchestrator(aiEngine);

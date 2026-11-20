import { apiRequest, isBackendConfigured } from "@/src/services/api";
import { onDeviceLlama } from "@/src/services/ai/OnDeviceLlamaEngine";
import { ruleEngine } from "@/src/services/ai/MockAIEngine";
import { detectToolIntent } from "@/src/services/ai/toolIntent";
import { ToolRegistry } from "@/src/services/tools/ToolRegistry";
import { modelService } from "@/src/services/models/ModelService";
import { AndroidAssistant } from "@/src/services/android/AndroidAssistant";
import type { AIEngine } from "@/src/services/ai/AIEngine.interface";
import type { AssistantState, Message, ToolCall } from "@/src/types";

import type { AgentOrchestrator, AgentReply } from "./AgentOrchestrator.interface";
import { contextManager } from "./ContextManager";
import { ActionValidator } from "./ActionValidator";
import { TaskPlanner } from "./TaskPlanner";

const ORCHESTRATOR_TIMEOUT_MS = 30000; // 30s maximum execution guard

/**
 * Intelligent, context-aware on-device agent orchestrator:
 * Context & Co-reference resolution -> Multi-step planning -> Action validation -> Tool execution -> LLM generation.
 * Enforces strict timeouts and state completion guarantees.
 */
class OnDeviceAgentOrchestrator implements AgentOrchestrator {
  async handle(text: string, history: Message[], onState: (s: AssistantState) => void): Promise<AgentReply> {
    onState("processing");

    const executionPromise = (async (): Promise<AgentReply> => {
      // 0. Active contact disambiguation response check
      const pendingDisambiguation = contextManager.getDisambiguation();
      if (pendingDisambiguation) {
        const choice = contextManager.resolveDisambiguationChoice(text);
        if (choice) {
          contextManager.clearDisambiguation();
          onState("executing");

          if (pendingDisambiguation.action === "call") {
            const hasCallPerm = await AndroidAssistant.hasDirectCallPermission();
            if (!hasCallPerm) {
              await AndroidAssistant.requestCallPermission();
            }
            const res = await AndroidAssistant.call(choice.number, false);
            const toolCall: ToolCall = {
              tool: "call_contact",
              params: { contact_name: choice.name, number: choice.number, mode: "direct" },
              status: res.success ? "completed" : "unavailable",
              summary: `Call ${choice.name}`,
            };
            contextManager.updateFromToolCall(toolCall);
            return {
              text: res.success ? `Calling ${choice.name} (${choice.type})...` : res.message,
              tool: toolCall,
            };
          } else if (pendingDisambiguation.action === "message") {
            const body = pendingDisambiguation.originalMessage || "";
            const res = await AndroidAssistant.openWhatsApp(choice.number, body);
            const toolCall: ToolCall = {
              tool: "draft_message",
              params: { recipient: choice.name, number: choice.number, body, app: "WhatsApp" },
              status: res.success ? "completed" : "unavailable",
              summary: `WhatsApp to ${choice.name}`,
            };
            contextManager.updateFromToolCall(toolCall);
            return {
              text: res.success
                ? `Opened WhatsApp conversation with ${choice.name} with your message prepared. Please tap send.`
                : res.message,
              tool: toolCall,
            };
          }
        } else if (/^(?:cancel|stop|never mind|abort|no)$/i.test(text.trim())) {
          contextManager.clearDisambiguation();
          return { text: "Action cancelled.", tool: null };
        } else {
          // User said something else, clear disambiguation and proceed
          contextManager.clearDisambiguation();
        }
      }

      // 1. Maintain short-term conversational context & resolve co-references
      contextManager.updateFromHistory(history);
      const { resolvedText } = contextManager.resolveCoReferences(text);

      // 2. Multi-step task planner
      const plan = TaskPlanner.plan(resolvedText);
      if (plan.isMultiStep && plan.steps.length > 1) {
        const messages: string[] = [];
        let pendingCall: ToolCall | null = null;

        for (const step of plan.steps) {
          const validation = await ActionValidator.validate(step.toolCall, true);
          if (!validation.valid) {
            return { text: validation.reason || "Action validation failed.", tool: null };
          }

          if (validation.requiresConfirmation) {
            pendingCall = step.toolCall;
            messages.push(`Step ${step.stepNumber}: ${step.description} requires your confirmation.`);
            break;
          }

          onState("executing");
          const out = await ToolRegistry.get(step.toolCall.tool).execute(step.toolCall.params);
          if (out.status === "pending_disambiguation" && (out as any).matches) {
            contextManager.setDisambiguation({
              action: step.toolCall.tool === "call_contact" ? "call" : "message",
              query: step.toolCall.params.contact_name || step.toolCall.params.recipient || "",
              candidates: (out as any).matches,
              originalMessage: step.toolCall.params.body,
            });
            return { text: out.message, tool: null };
          }
          messages.push(out.message);
          contextManager.updateFromToolCall(step.toolCall);
        }

        return {
          text: messages.join("\n\n"),
          tool: pendingCall,
        };
      }

      // 3. Single tool-intent detection
      const intent = detectToolIntent(resolvedText);
      if (intent) {
        const call: ToolCall = {
          tool: intent.tool,
          params: intent.params,
          status: "pending_confirmation",
          summary: intent.summary,
        };

        // Validate action contract
        const validation = await ActionValidator.validate(call, true);
        if (!validation.valid) {
          return { text: validation.reason || "Unable to proceed with action.", tool: null };
        }

        if (validation.missingPermissions.length > 0) {
          return {
            text: `Action requires permission: ${validation.missingPermissions.join(", ")}. Please grant access in device settings.`,
            tool: null,
          };
        }

        if (intent.requiresConfirmation || validation.requiresConfirmation) {
          return { text: intent.intro, tool: call };
        }

        onState("executing");
        const out = await ToolRegistry.get(intent.tool).execute(intent.params);
        if (out.status === "pending_disambiguation" && (out as any).matches) {
          contextManager.setDisambiguation({
            action: intent.tool === "call_contact" ? "call" : "message",
            query: intent.params.contact_name || intent.params.recipient || "",
            candidates: (out as any).matches,
            originalMessage: intent.params.body,
          });
          return { text: out.message, tool: null };
        }
        contextManager.updateFromToolCall(call);
        return { text: out.message, tool: { ...call, status: out.status } };
      }

      // 4. Conversational generation
      const replyText = await this.generate(resolvedText, history);
      return { text: replyText, tool: null };
    })();

    const timeoutPromise = new Promise<AgentReply>((resolve) =>
      setTimeout(
        () =>
          resolve({
            text: "Request processing timed out. Please try asking again or check your model configuration.",
            tool: null,
          }),
        ORCHESTRATOR_TIMEOUT_MS
      )
    );

    try {
      return await Promise.race([executionPromise, timeoutPromise]);
    } catch (err: any) {
      console.warn("[AgentOrchestrator] handle error:", err);
      return {
        text: `An error occurred: ${err?.message || "Unknown error"}. Try again.`,
        tool: null,
      };
    }
  }

  private async generate(text: string, history: Message[]): Promise<string> {
    const state = await modelService.loadState();
    const selectedLlmId = state.selectedLlm;

    // 4a. If user selected Companion Backend LLM
    if (selectedLlmId === "llm-companion" && isBackendConfigured()) {
      try {
        const backend = await apiRequest<{ text: string; tool: ToolCall | null }>("api/chat/generate", {
          method: "POST",
          body: JSON.stringify({ text, history }),
        });
        if (backend.data && !backend.error && backend.data.text) {
          return backend.data.text;
        }
      } catch {
        /* fall through to offline fallback */
      }
    }

    // 4b. On-device local GGUF model
    if (selectedLlmId && selectedLlmId !== "llm-companion") {
      const modelMeta = modelService.findModel(selectedLlmId);
      if (modelMeta?.requiresDownload && !state.installed.includes(selectedLlmId)) {
        return `The selected model (${modelMeta.name}) is not downloaded yet. Open the Models tab to download it for offline reasoning.`;
      }

      if (await onDeviceLlama.ensureReady()) {
        const res = await onDeviceLlama.generate({ text, history });
        if (res.text) return res.text;
      }

      const why = onDeviceLlama.unavailableReason();
      if (why) return why;
    }

    // 4c. Optional companion backend fallback if configured
    if (isBackendConfigured()) {
      try {
        const backend = await apiRequest<{ text: string; tool: ToolCall | null }>("api/chat/generate", {
          method: "POST",
          body: JSON.stringify({ text, history }),
        });
        if (backend.data && !backend.error && backend.data.text) {
          return backend.data.text;
        }
      } catch {
        /* fall through */
      }
    }

    // 4d. Deterministic offline fallback engine
    const fallback = await ruleEngine.generate({ text, history });
    return fallback.text;
  }

  async resolveConfirmation(tool: ToolCall, approved: boolean, onState: (s: AssistantState) => void): Promise<AgentReply> {
    if (!approved) {
      return { text: "Cancelled. Nothing was changed on your device.", tool: { ...tool, status: "cancelled" } };
    }

    const validation = await ActionValidator.validate(tool, true);
    if (!validation.valid) {
      return { text: validation.reason || "Action rejected during validation.", tool: { ...tool, status: "cancelled" } };
    }

    onState("executing");
    try {
      const out = await ToolRegistry.get(tool.tool).execute(tool.params);
      contextManager.updateFromToolCall(tool);
      return { text: out.message, tool: { ...tool, status: out.status } };
    } catch (e: any) {
      return {
        text: `Action execution failed: ${e?.message || "Unknown error"}.`,
        tool: { ...tool, status: "unavailable" },
      };
    }
  }
}

export const agent: AgentOrchestrator = new OnDeviceAgentOrchestrator();
export const aiEngine: AIEngine = onDeviceLlama;

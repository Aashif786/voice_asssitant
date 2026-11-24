import { apiRequest, isBackendConfigured } from "@/src/services/api";
import { onDeviceLlama } from "@/src/services/ai/OnDeviceLlamaEngine";
import { ruleEngine } from "@/src/services/ai/MockAIEngine";
import { detectToolIntent } from "@/src/services/ai/toolIntent";
import { ToolRegistry } from "@/src/services/tools/ToolRegistry";
import { modelService } from "@/src/services/models/ModelService";
import { AndroidAssistant } from "@/src/services/android/AndroidAssistant";
import { VoiceSecurityService } from "@/src/services/voice/VoiceSecurityService";
import { getStoredSettings } from "@/src/store/settings";
import type { AIEngine } from "@/src/services/ai/AIEngine.interface";
import type { AssistantState, Message, ToolCall } from "@/src/types";

import type { AgentExecutionOptions, AgentOrchestrator, AgentReply } from "./AgentOrchestrator.interface";
import { contextManager } from "./ContextManager";
import { ActionValidator } from "./ActionValidator";
import { TaskPlanner } from "./TaskPlanner";

const ORCHESTRATOR_TIMEOUT_MS = 60000; // 60s maximum execution guard (allows on-device inference)

/**
 * Intelligent, context-aware on-device agent orchestrator:
 * Context & Co-reference resolution -> Multi-step planning -> Action validation -> Tool execution -> LLM generation.
 * Enforces strict timeouts and state completion guarantees.
 */
class OnDeviceAgentOrchestrator implements AgentOrchestrator {
  private async resolveOwnerVerification(options?: AgentExecutionOptions): Promise<boolean> {
    if (options?.ownerVerified !== undefined) {
      return options.ownerVerified;
    }

    const isVoice = options?.isVoice ?? false;
    if (!isVoice) {
      // Direct UI / text commands are considered owner-verified
      return true;
    }

    const settings = await getStoredSettings();
    if (!settings.ownerOnlyMode) {
      // If owner-only mode is false, allow it
      return true;
    }

    // If owner-only mode is true and command is from voice, require valid speaker verification
    return VoiceSecurityService.isLastVoiceVerified();
  }

  async handle(
    text: string,
    history: Message[],
    onState: (s: AssistantState) => void,
    options?: AgentExecutionOptions
  ): Promise<AgentReply> {
    onState("processing");

    const executionPromise = (async (): Promise<AgentReply> => {
      const ownerVerified = await this.resolveOwnerVerification(options);
      const settings = await getStoredSettings();
      const callMode = settings.callMode ?? "dialer";

      // 0. Active contact disambiguation response check
      const pendingDisambiguation = contextManager.getDisambiguation();
      if (pendingDisambiguation) {
        const choice = contextManager.resolveDisambiguationChoice(text);
        if (choice) {
          contextManager.clearDisambiguation();

          if (!ownerVerified) {
            return {
              text: "Unauthorized speaker. Action cancelled under Owner-Only Security Policy.",
              tool: null,
            };
          }

          onState("executing");

          if (pendingDisambiguation.action === "call") {
            const isDialerMode = callMode === "dialer";
            let res;
            if (isDialerMode) {
              res = await AndroidAssistant.dial(choice.number);
            } else {
              const hasCallPerm = await AndroidAssistant.hasDirectCallPermission();
              if (!hasCallPerm) {
                await AndroidAssistant.requestCallPermission();
              }
              res = await AndroidAssistant.call(choice.number, true);
            }
            const toolCall: ToolCall = {
              tool: "call_contact",
              params: { contact_name: choice.name, number: choice.number, mode: callMode },
              status: res.success ? "completed" : "unavailable",
              summary: `${isDialerMode ? "Dial" : "Call"} ${choice.name}`,
            };
            contextManager.updateFromToolCall(toolCall);
            return {
              text: res.success
                ? isDialerMode
                  ? `Opened dialer for ${choice.name} (${choice.number}).`
                  : `Calling ${choice.name} (${choice.type})...`
                : res.message,
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
      const plan = TaskPlanner.plan(resolvedText, callMode);
      if (plan.isMultiStep && plan.steps.length > 1) {
        const messages: string[] = [];
        let pendingCall: ToolCall | null = null;

        for (const step of plan.steps) {
          const validation = await ActionValidator.validate(step.toolCall, ownerVerified);
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
      const intent = detectToolIntent(resolvedText, callMode);
      if (intent) {
        const call: ToolCall = {
          tool: intent.tool,
          params: intent.params,
          status: "pending_confirmation",
          summary: intent.summary,
        };

        // Validate action contract with actual owner verification state
        const validation = await ActionValidator.validate(call, ownerVerified);
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
      // Fallback gracefully instead of failing with connection error
      const fallback = await ruleEngine.generate({ text, history });
      return {
        text: fallback.text,
        tool: null,
      };
    }
  }

  private async generate(text: string, history: Message[]): Promise<string> {
    const state = await modelService.loadState();
    const selectedLlmId = state.selectedLlm;
    const settings = await getStoredSettings();

    // 1. If on-device local GGUF model is downloaded & ready natively (custom dev build with llama.rn)
    if (selectedLlmId && selectedLlmId !== "llm-companion" && onDeviceLlama.available()) {
      const modelMeta = modelService.findModel(selectedLlmId);
      if (modelMeta?.requiresDownload && state.installed.includes(selectedLlmId)) {
        const modelPath = modelService.pathFor(selectedLlmId);
        await onDeviceLlama.setModel(modelPath, modelMeta.name);
        if (await onDeviceLlama.ensureReady(settings.contextLength)) {
          try {
            const res = await onDeviceLlama.generate({ text, history, temperature: settings.temperature });
            if (res.text) return res.text;
          } catch {
            /* fall through to backend or rule engine */
          }
        }
      }
    }

    // 2. Companion Backend Server (handles GGUF llama-server, local models, or cloud models seamlessly)
    if (isBackendConfigured()) {
      try {
        const backend = await apiRequest<{ text: string; tool: ToolCall | null }>("api/chat/generate", {
          method: "POST",
          body: JSON.stringify({
            text,
            history,
            model: selectedLlmId,
            temperature: settings.temperature,
            context_length: settings.contextLength,
            language: settings.language,
          }),
        });
        if (backend.data && !backend.error && backend.data.text) {
          return backend.data.text;
        }
      } catch {
        /* fall through to offline fallback */
      }
    }

    // 3. Deterministic offline rule engine fallback
    const fallback = await ruleEngine.generate({ text, history, temperature: settings.temperature });
    return fallback.text;
  }

  async resolveConfirmation(
    tool: ToolCall,
    approved: boolean,
    onState: (s: AssistantState) => void,
    options?: AgentExecutionOptions
  ): Promise<AgentReply> {
    if (!approved) {
      return { text: "Cancelled. Nothing was changed on your device.", tool: { ...tool, status: "cancelled" } };
    }

    const ownerVerified = await this.resolveOwnerVerification(options);
    const validation = await ActionValidator.validate(tool, ownerVerified);
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

import { detectToolIntent } from "@/src/services/ai/toolIntent";
import type { ToolCall } from "@/src/types";

export interface PlannedStep {
  id: string;
  stepNumber: number;
  description: string;
  toolCall: ToolCall;
  status: "pending" | "running" | "completed" | "failed";
  resultMessage?: string;
}

export interface MultiStepPlan {
  isMultiStep: boolean;
  userPrompt: string;
  steps: PlannedStep[];
}

export const TaskPlanner = {
  /**
   * Evaluates whether user utterance contains sequential or conjoined tasks.
   * e.g., "Turn on flashlight and check the battery", "Find restaurants"
   */
  plan(text: string): MultiStepPlan {
    const raw = text.trim();

    // 1. Direct single intent check (handles phrases like "Open WhatsApp and send Aashif a hi message")
    const directIntent = detectToolIntent(raw);
    if (directIntent) {
      return {
        isMultiStep: false,
        userPrompt: raw,
        steps: [
          {
            id: "step_1",
            stepNumber: 1,
            description: directIntent.summary,
            toolCall: {
              tool: directIntent.tool,
              params: directIntent.params,
              status: "pending_confirmation",
              summary: directIntent.summary,
            },
            status: "pending",
          },
        ],
      };
    }

    // 2. Check for conjunctions: " and then ", " then ", " and also ", " after that ", " and "
    const parts = raw
      .split(/\s+(?:and then|then|and also|after that|and)\s+/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 2);

    if (parts.length <= 1) {
      return { isMultiStep: false, userPrompt: raw, steps: [] };
    }

    // 3. Multiple steps evaluation
    const steps: PlannedStep[] = [];
    let stepNum = 1;

    for (const part of parts) {
      const intent = detectToolIntent(part);
      if (intent) {
        steps.push({
          id: `step_${stepNum}`,
          stepNumber: stepNum,
          description: intent.summary,
          toolCall: {
            tool: intent.tool,
            params: intent.params,
            status: "pending_confirmation",
            summary: intent.summary,
          },
          status: "pending",
        });
        stepNum++;
      }
    }

    return {
      isMultiStep: steps.length > 1,
      userPrompt: raw,
      steps,
    };
  },
};

export default TaskPlanner;

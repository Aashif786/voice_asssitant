import { AndroidAssistant } from "@/src/services/android/AndroidAssistant";
import type { ToolCall } from "@/src/types";

export interface ValidationReport {
  valid: boolean;
  requiresConfirmation: boolean;
  missingPermissions: string[];
  reason?: string;
}

export const ActionValidator = {
  async validate(toolCall: ToolCall, ownerVerified: boolean = true): Promise<ValidationReport> {
    const missingPermissions: string[] = [];

    // 1. Owner-only authorization check
    if (!ownerVerified) {
      return {
        valid: false,
        requiresConfirmation: false,
        missingPermissions: [],
        reason: "Unauthorized speaker. Action cancelled under Owner-Only Security Policy.",
      };
    }

    // 2. Tool-specific parameter & permission checks
    switch (toolCall.tool) {
      case "call_contact": {
        const contact = toolCall.params.contact_name?.trim();
        if (!contact) {
          return { valid: false, requiresConfirmation: false, missingPermissions: [], reason: "Contact name or phone number is required." };
        }
        const hasContactsPerm = await AndroidAssistant.hasContactsPermission();
        if (!hasContactsPerm) {
          missingPermissions.push("android.permission.READ_CONTACTS");
        }
        if (toolCall.params.mode === "direct") {
          const hasCallPerm = await AndroidAssistant.hasDirectCallPermission();
          if (!hasCallPerm) {
            missingPermissions.push("android.permission.CALL_PHONE");
          }
        }
        return {
          valid: true,
          requiresConfirmation: false,
          missingPermissions,
        };
      }

      case "open_app": {
        const app = toolCall.params.app_name?.trim();
        if (!app) {
          return { valid: false, requiresConfirmation: false, missingPermissions: [], reason: "Application name is required." };
        }
        return { valid: true, requiresConfirmation: false, missingPermissions: [] };
      }

      case "draft_message": {
        const recipient = toolCall.params.recipient?.trim();
        const body = toolCall.params.body?.trim();
        if (!recipient) {
          return { valid: false, requiresConfirmation: false, missingPermissions: [], reason: "Recipient is required for messaging." };
        }
        if (!body) {
          return { valid: false, requiresConfirmation: false, missingPermissions: [], reason: "Message body cannot be empty." };
        }
        return { valid: true, requiresConfirmation: false, missingPermissions: [] };
      }

      case "device_control": {
        const setting = toolCall.params.setting?.trim();
        if (!setting) {
          return { valid: false, requiresConfirmation: false, missingPermissions: [], reason: "Setting target is required." };
        }
        return { valid: true, requiresConfirmation: false, missingPermissions: [] };
      }

      case "create_reminder": {
        const task = toolCall.params.task?.trim();
        if (!task) {
          return { valid: false, requiresConfirmation: false, missingPermissions: [], reason: "Reminder task is required." };
        }
        return { valid: true, requiresConfirmation: true, missingPermissions: [] };
      }

      default:
        return { valid: true, requiresConfirmation: false, missingPermissions: [] };
    }
  },
};

export default ActionValidator;

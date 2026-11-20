import type { Message, ToolCall } from "@/src/types";

export interface DisambiguationCandidate {
  id?: string;
  name: string;
  number: string;
  type?: string;
}

export interface DisambiguationContext {
  action: "call" | "message";
  query: string;
  candidates: DisambiguationCandidate[];
  originalMessage?: string;
}

export interface ConversationContext {
  lastReferencedContact?: string;
  lastReferencedPhoneNumber?: string;
  lastReferencedApp?: string;
  lastReferencedLocation?: string;
  lastReferencedTime?: string;
  lastExecutedTool?: string;
}

class ContextManager {
  private context: ConversationContext = {};
  private pendingDisambiguation: DisambiguationContext | null = null;

  getContext(): ConversationContext {
    return { ...this.context };
  }

  setContext(partial: Partial<ConversationContext>) {
    this.context = { ...this.context, ...partial };
  }

  clear() {
    this.context = {};
    this.pendingDisambiguation = null;
  }

  setDisambiguation(d: DisambiguationContext | null) {
    this.pendingDisambiguation = d;
  }

  getDisambiguation(): DisambiguationContext | null {
    return this.pendingDisambiguation;
  }

  clearDisambiguation() {
    this.pendingDisambiguation = null;
  }

  /**
   * Resolves a user's reply against active candidates:
   * Supports "1st", "second", "1", "2", direct contact name, or type (mobile/work).
   */
  resolveDisambiguationChoice(text: string): DisambiguationCandidate | null {
    if (!this.pendingDisambiguation) return null;
    const { candidates } = this.pendingDisambiguation;
    const clean = text.trim().toLowerCase();

    // 1. Ordinal / index word matching
    const ordinals: Record<string, number> = {
      "1": 0, "1st": 0, "first": 0, "one": 0, "the 1st": 0, "the first": 0, "first one": 0, "the first one": 0,
      "2": 1, "2nd": 1, "second": 1, "two": 1, "the 2nd": 1, "the second": 1, "second one": 1, "the second one": 1,
      "3": 2, "3rd": 2, "third": 2, "three": 2, "the 3rd": 2, "the third": 2, "third one": 2, "the third one": 2,
      "4": 3, "4th": 3, "fourth": 3, "four": 3, "the 4th": 3, "the fourth": 3, "fourth one": 3, "the fourth one": 3,
      "5": 4, "5th": 4, "fifth": 4, "five": 4, "the 5th": 4, "the fifth": 4, "fifth one": 4, "the fifth one": 4,
    };

    if (ordinals[clean] !== undefined && candidates[ordinals[clean]]) {
      return candidates[ordinals[clean]];
    }

    for (const [key, idx] of Object.entries(ordinals)) {
      const regex = new RegExp(`\\b${key}\\b`, "i");
      if (regex.test(clean) && candidates[idx]) {
        return candidates[idx];
      }
    }

    // Number matching (e.g. "1", "2", "option 1", "number 2")
    const numMatch = clean.match(/(?:option|number|choice|item)?\s*#?([1-9])\b/);
    if (numMatch) {
      const idx = parseInt(numMatch[1], 10) - 1;
      if (candidates[idx]) {
        return candidates[idx];
      }
    }

    // 2a. Exact full name match first across all candidates
    for (const c of candidates) {
      const cName = c.name.toLowerCase();
      if (clean === cName || clean === `call ${cName}` || clean === `message ${cName}`) {
        return c;
      }
    }

    // 2b. Score candidates by match quality
    let bestCandidate: DisambiguationCandidate | null = null;
    let maxScore = 0;
    for (const c of candidates) {
      const cName = c.name.toLowerCase();
      let score = 0;
      if (clean.includes(cName)) score += 10;
      const parts = cName.split(/\s+/).filter((p) => p.length >= 3);
      for (const part of parts) {
        if (clean.includes(part)) {
          score += 2;
        }
      }
      if (c.type && clean.includes(c.type.toLowerCase())) {
        score += 5;
      }
      if (score > maxScore) {
        maxScore = score;
        bestCandidate = c;
      }
    }

    if (bestCandidate && maxScore >= 2) {
      return bestCandidate;
    }

    return null;
  }

  /**
   * Scans conversation history and recent messages to extract recent entities.
   */
  updateFromHistory(history: Message[]) {
    // Traverse history in reverse (most recent first)
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg.tool) {
        this.updateFromToolCall(msg.tool);
      }
      this.extractEntitiesFromText(msg.content);
    }
  }

  updateFromToolCall(toolCall: ToolCall) {
    this.context.lastExecutedTool = toolCall.tool;
    if (toolCall.params.recipient) {
      this.context.lastReferencedContact = toolCall.params.recipient;
    }
    if (toolCall.params.contact_name) {
      this.context.lastReferencedContact = toolCall.params.contact_name;
    }
    if (toolCall.params.app_name) {
      this.context.lastReferencedApp = toolCall.params.app_name;
    }
    if (toolCall.params.time) {
      this.context.lastReferencedTime = toolCall.params.time;
    }
  }

  private extractEntitiesFromText(text: string) {
    // Detect contact names
    const contactMatch = text.match(/(?:to|with|call|message)\s+([A-Z][a-z]+)/);
    if (contactMatch && !this.context.lastReferencedContact) {
      this.context.lastReferencedContact = contactMatch[1];
    }
    // Detect app names
    const appMatch = text.match(/(?:in|on|open|launch)\s+(WhatsApp|YouTube|Chrome|Instagram|Camera|Settings)/i);
    if (appMatch && !this.context.lastReferencedApp) {
      this.context.lastReferencedApp = appMatch[1];
    }
  }

  /**
   * Resolves pronouns and elliptical references:
   * "Tell him...", "Call her", "Send it to him", "Open it"
   */
  resolveCoReferences(text: string): { resolvedText: string; resolvedContact?: string } {
    let resolved = text;
    let contactResolved: string | undefined;

    // Pronouns referring to contacts: him, her, them
    if (this.context.lastReferencedContact) {
      const contact = this.context.lastReferencedContact;

      // "tell him / her / them that..."
      const tellMatch = resolved.match(/\b(?:tell|message|text|inform)\s+(?:him|her|them)\s+(.+)/i);
      if (tellMatch) {
        resolved = `message ${contact} that ${tellMatch[1]}`;
        contactResolved = contact;
      }

      // "call him / her / them"
      const callMatch = resolved.match(/\b(?:call|phone|dial)\s+(?:him|her|them)\b/i);
      if (callMatch) {
        resolved = `call ${contact}`;
        contactResolved = contact;
      }

      // "send it to him / her"
      const sendMatch = resolved.match(/\b(?:send|forward)\s+(?:it|this)?\s*(?:to\s+)?(?:him|her|them)\b/i);
      if (sendMatch) {
        resolved = resolved.replace(/\b(?:him|her|them)\b/i, contact);
        contactResolved = contact;
      }
    }

    // Pronouns referring to apps: "open it", "launch it"
    if (this.context.lastReferencedApp) {
      const app = this.context.lastReferencedApp;
      if (/\b(?:open|launch|start)\s+it\b/i.test(resolved)) {
        resolved = `open ${app}`;
      }
    }

    return { resolvedText: resolved, resolvedContact: contactResolved };
  }
}

export const contextManager = new ContextManager();
export default contextManager;

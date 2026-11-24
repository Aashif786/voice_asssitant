import assert from "node:assert";
import { ContextManager, contextManager } from "../src/services/agent/ContextManager.ts";

const candidates = [
  { id: "1", name: "Rahul Sharma", number: "+919876543210", type: "Mobile" },
  { id: "2", name: "Rahul Verma", number: "+919123456789", type: "Work" },
  { id: "3", name: "Rahul Kapoor", number: "+919988776655", type: "Home" },
];

console.log("--- Running Real ContextManager Disambiguation & Co-Reference Tests ---");

const cm = new ContextManager();
cm.setDisambiguation({
  action: "call",
  query: "Rahul",
  candidates,
});

// Test 1: Ordinals
assert.strictEqual(cm.resolveDisambiguationChoice("1st")?.name, "Rahul Sharma");
assert.strictEqual(cm.resolveDisambiguationChoice("the first one")?.name, "Rahul Sharma");
assert.strictEqual(cm.resolveDisambiguationChoice("second")?.name, "Rahul Verma");
assert.strictEqual(cm.resolveDisambiguationChoice("2nd")?.name, "Rahul Verma");
assert.strictEqual(cm.resolveDisambiguationChoice("3")?.name, "Rahul Kapoor");
console.log("✓ Test 1: Ordinal choices matched correctly.");

// Test 2: Name directly
assert.strictEqual(cm.resolveDisambiguationChoice("Rahul Verma")?.name, "Rahul Verma");
assert.strictEqual(cm.resolveDisambiguationChoice("Verma")?.name, "Rahul Verma");
assert.strictEqual(cm.resolveDisambiguationChoice("Kapoor")?.name, "Rahul Kapoor");
console.log("✓ Test 2: Direct name matching passed.");

// Test 3: Type matching
assert.strictEqual(cm.resolveDisambiguationChoice("the mobile one")?.name, "Rahul Sharma");
assert.strictEqual(cm.resolveDisambiguationChoice("work")?.name, "Rahul Verma");
console.log("✓ Test 3: Contact type matching passed.");

// Test 4: Co-reference resolution
cm.clear();
cm.setContext({ lastReferencedContact: "John", lastReferencedApp: "WhatsApp" });

const callRes = cm.resolveCoReferences("call him");
assert.strictEqual(callRes.resolvedText, "call John");
assert.strictEqual(callRes.resolvedContact, "John");

const msgRes = cm.resolveCoReferences("tell him that I will be late");
assert.strictEqual(msgRes.resolvedText, "message John that I will be late");
assert.strictEqual(msgRes.resolvedContact, "John");

const appRes = cm.resolveCoReferences("open it");
assert.strictEqual(appRes.resolvedText, "open WhatsApp");
console.log("✓ Test 4: Co-reference resolution ('call him', 'tell him', 'open it') passed.");

// Test 5: Verify singleton export works as well
contextManager.clear();
contextManager.setDisambiguation({ action: "message", query: "Rahul", candidates });
assert.strictEqual(contextManager.resolveDisambiguationChoice("1st")?.name, "Rahul Sharma");
console.log("✓ Test 5: Default singleton contextManager works identically.");

console.log("\nAll ContextManager tests passed successfully!");

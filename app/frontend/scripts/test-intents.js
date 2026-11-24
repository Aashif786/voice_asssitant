import assert from "node:assert";
import { detectToolIntent } from "../src/services/ai/toolIntent.ts";

console.log("Running Frontend Intent Detection Unit Tests (Real Module)...");

// Test 1: The exact reported issue: "Open WhatsApp and send Aashif a hi message."
{
  const res = detectToolIntent("Open WhatsApp and send Aashif a hi message.");
  assert.ok(res, "Result should not be null");
  assert.strictEqual(res.tool, "draft_message");
  assert.strictEqual(res.params.recipient.toLowerCase(), "aashif");
  assert.strictEqual(res.params.body.toLowerCase(), "hi");
  console.log("✓ Test 1: 'Open WhatsApp and send Aashif a hi message.' passed!");
}

// Test 2: Variation without period: "Open WhatsApp and send Aashif a hi message"
{
  const res = detectToolIntent("Open WhatsApp and send Aashif a hi message");
  assert.ok(res);
  assert.strictEqual(res.tool, "draft_message");
  assert.strictEqual(res.params.recipient.toLowerCase(), "aashif");
  assert.strictEqual(res.params.body.toLowerCase(), "hi");
  console.log("✓ Test 2: 'Open WhatsApp and send Aashif a hi message' passed!");
}

// Test 3: Variation: "Send Aashif a hi message on WhatsApp"
{
  const res = detectToolIntent("Send Aashif a hi message on WhatsApp");
  assert.ok(res);
  assert.strictEqual(res.tool, "draft_message");
  assert.strictEqual(res.params.recipient.toLowerCase(), "aashif");
  assert.strictEqual(res.params.body.toLowerCase(), "hi");
  console.log("✓ Test 3: 'Send Aashif a hi message on WhatsApp' passed!");
}

// Test 4: Pure app launch: "Open WhatsApp"
{
  const res = detectToolIntent("Open WhatsApp");
  assert.ok(res);
  assert.strictEqual(res.tool, "open_app");
  assert.strictEqual(res.params.app_name.toLowerCase(), "whatsapp");
  console.log("✓ Test 4: 'Open WhatsApp' passed!");
}

// Test 5: Pure app launch: "Open Chrome"
{
  const res = detectToolIntent("Open Chrome");
  assert.ok(res);
  assert.strictEqual(res.tool, "open_app");
  assert.strictEqual(res.params.app_name.toLowerCase(), "chrome");
  console.log("✓ Test 5: 'Open Chrome' passed!");
}

// Test 6: Clock: "What time is it?"
{
  const res = detectToolIntent("What time is it?");
  assert.ok(res);
  assert.strictEqual(res.tool, "get_time");
  console.log("✓ Test 6: 'What time is it?' passed!");
}

// Test 7: Device Control: "Turn on flashlight"
{
  const res = detectToolIntent("Turn on flashlight");
  assert.ok(res);
  assert.strictEqual(res.tool, "device_control");
  assert.strictEqual(res.params.setting, "flashlight");
  assert.strictEqual(res.params.value, "on");
  console.log("✓ Test 7: 'Turn on flashlight' passed!");
}

// Test 8: Call with trailing punctuation: "Call Mom."
{
  const res = detectToolIntent("Call Mom.");
  assert.ok(res);
  assert.strictEqual(res.tool, "call_contact");
  assert.strictEqual(res.params.contact_name, "Mom");
  console.log("✓ Test 8: 'Call Mom.' with trailing period passed!");
}

// Test 9: Reminders with trailing tomorrow / tonight
{
  const res1 = detectToolIntent("Remind me to buy milk tomorrow");
  assert.ok(res1);
  assert.strictEqual(res1.tool, "create_reminder");
  assert.strictEqual(res1.params.task, "Buy milk");
  assert.strictEqual(res1.params.time, "Tomorrow");

  const res2 = detectToolIntent("Remind me to call John tonight.");
  assert.ok(res2);
  assert.strictEqual(res2.tool, "create_reminder");
  assert.strictEqual(res2.params.task, "Call John");
  assert.strictEqual(res2.params.time, "Tonight");
  console.log("✓ Test 9: Reminders with trailing 'tomorrow'/'tonight' passed!");
}

console.log("\nALL REAL FRONTEND INTENT DETECTION UNIT TESTS PASSED SUCCESSFULLY!");

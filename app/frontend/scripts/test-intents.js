const assert = require("assert");

// Mock regex matching and intent logic from toolIntent.ts
function detectToolIntent(text) {
  const t = text.trim();
  const l = t.toLowerCase();

  // Clock
  if (/\b(what time|current time|the time|what's the date|what day is it|tell me the time)\b/.test(l)) {
    return { tool: "get_time", params: {}, requiresConfirmation: false };
  }

  // 1. WhatsApp Compound: "Open WhatsApp and send <recipient> (a)? <msg> (message)?"
  const openAndSendMatch = t.match(/^(?:open\s+whatsapp\s+(?:and\s+)?send\s+([a-zA-Z0-9]+)\s+(?:a\s+)?(.+?)(?:\s+message)?[\.\?!]?)$/i);
  if (openAndSendMatch) {
    const recipient = openAndSendMatch[1];
    let body = openAndSendMatch[2].trim();
    if (body.toLowerCase().endsWith(" message")) {
      body = body.slice(0, -8).trim();
    }
    return {
      tool: "draft_message",
      params: { recipient, body },
      requiresConfirmation: true,
      summary: `WhatsApp to ${recipient}: "${body}"`,
    };
  }

  // 2. "Send <recipient> (a)? <msg> (message)? (on|via)? whatsapp"
  const sendViaWaMatch = t.match(/^(?:send\s+([a-zA-Z0-9]+)\s+(?:a\s+)?(.+?)(?:\s+message)?\s+(?:on|via)\s+whatsapp[\.\?!]?)$/i);
  if (sendViaWaMatch) {
    const recipient = sendViaWaMatch[1];
    let body = sendViaWaMatch[2].trim();
    if (body.toLowerCase().endsWith(" message")) {
      body = body.slice(0, -8).trim();
    }
    return {
      tool: "draft_message",
      params: { recipient, body },
      requiresConfirmation: true,
      summary: `WhatsApp to ${recipient}: "${body}"`,
    };
  }

  // 3. "Send <recipient> a <msg> message"
  const sendAMsgMatch = t.match(/^(?:send\s+([a-zA-Z0-9]+)\s+a\s+(.+?)\s+message[\.\?!]?)$/i);
  if (sendAMsgMatch) {
    const recipient = sendAMsgMatch[1];
    const body = sendAMsgMatch[2].trim();
    return {
      tool: "draft_message",
      params: { recipient, body },
      requiresConfirmation: true,
      summary: `Message to ${recipient}: "${body}"`,
    };
  }

  // 4. App Launcher
  const openAppMatch = t.match(/^(?:open|launch|start)\s+([a-zA-Z0-9\s]+?)[\.\?!]?$/i);
  if (openAppMatch) {
    const appCandidate = openAppMatch[1].trim();
    if (!appCandidate.toLowerCase().includes(" and ") && !["calendar", "schedule", "agenda", "reminders"].includes(appCandidate.toLowerCase())) {
      return {
        tool: "open_app",
        params: { app_name: appCandidate },
        requiresConfirmation: false,
      };
    }
  }

  // 5. Flashlight
  if (/\b(turn on flashlight|turn on torch|flashlight on)\b/.test(l)) {
    return { tool: "device_control", params: { setting: "flashlight", value: "on" }, requiresConfirmation: false };
  }

  return null;
}

console.log("Running Frontend Intent Detection Unit Tests...");

// Test 1: The exact reported issue: "Open WhatsApp and send Aashif a hi message."
{
  const res = detectToolIntent("Open WhatsApp and send Aashif a hi message.");
  assert.ok(res, "Result should not be null");
  assert.strictEqual(res.tool, "draft_message");
  assert.strictEqual(res.params.recipient.toLowerCase(), "aashif");
  assert.strictEqual(res.params.body.toLowerCase(), "hi");
  assert.strictEqual(res.requiresConfirmation, true);
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

console.log("\nALL 7 FRONTEND UNIT TESTS PASSED SUCCESSFULLY!");

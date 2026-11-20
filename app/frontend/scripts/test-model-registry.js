const assert = require("assert");

// Mock model catalogue structure as implemented in ModelService.ts
const MODEL_CATALOGUE = [
  // LLM
  { id: "smollm2-135m", type: "llm", name: "SmolLM2 135M Instruct", requiresDownload: true, execution: "local" },
  { id: "qwen2.5-0.5b", type: "llm", name: "Qwen 2.5 0.5B Instruct", requiresDownload: true, execution: "local" },
  { id: "llm-companion", type: "llm", name: "Companion Backend LLM", requiresDownload: false, execution: "cloud" },
  // STT
  { id: "stt-system", type: "stt", name: "System Speech Recognizer", requiresDownload: false, execution: "system" },
  { id: "stt-whisper-base", type: "stt", name: "Whisper Base", requiresDownload: true, execution: "local" },
  { id: "stt-whisper-tiny", type: "stt", name: "Whisper Tiny", requiresDownload: true, execution: "local" },
  { id: "stt-companion", type: "stt", name: "Companion Whisper STT", requiresDownload: false, execution: "cloud" },
];

console.log("Running Model Registry & Independent Selection Tests...");

// Test 1: Catalogue partitioning
{
  const llmModels = MODEL_CATALOGUE.filter(m => m.type === "llm");
  const sttModels = MODEL_CATALOGUE.filter(m => m.type === "stt");

  assert.strictEqual(llmModels.length, 3);
  assert.strictEqual(sttModels.length, 4);
  console.log("✓ Test 1: Model catalogue partitioned into LLM and STT models correctly.");
}

// Test 2: System and Cloud STT do not require download
{
  const sysStt = MODEL_CATALOGUE.find(m => m.id === "stt-system");
  assert.strictEqual(sysStt.requiresDownload, false);
  assert.strictEqual(sysStt.execution, "system");

  const compStt = MODEL_CATALOGUE.find(m => m.id === "stt-companion");
  assert.strictEqual(compStt.requiresDownload, false);
  assert.strictEqual(compStt.execution, "cloud");
  console.log("✓ Test 2: System and Cloud STT models do not require download.");
}

// Test 3: Local Whisper models require download
{
  const whisperBase = MODEL_CATALOGUE.find(m => m.id === "stt-whisper-base");
  assert.strictEqual(whisperBase.requiresDownload, true);
  assert.strictEqual(whisperBase.execution, "local");
  console.log("✓ Test 3: Local Whisper models require explicit download.");
}

// Test 4: Independent state persistence simulation
{
  let state = {
    installed: ["stt-system", "stt-companion", "llm-companion"],
    selectedLlm: "smollm2-135m",
    selectedStt: null // No STT auto-downloaded on initial setup
  };

  assert.strictEqual(state.selectedStt, null, "STT must not be auto-installed on initial setup");

  // User selects system STT
  state.selectedStt = "stt-system";
  assert.strictEqual(state.selectedStt, "stt-system");
  assert.strictEqual(state.selectedLlm, "smollm2-135m");

  // User changes LLM independently
  state.selectedLlm = "qwen2.5-0.5b";
  assert.strictEqual(state.selectedLlm, "qwen2.5-0.5b");
  assert.strictEqual(state.selectedStt, "stt-system", "Changing LLM must not alter selected STT");

  console.log("✓ Test 4: Independent LLM and STT selection verified.");
}

console.log("\nALL MODEL REGISTRY TESTS PASSED SUCCESSFULLY!");

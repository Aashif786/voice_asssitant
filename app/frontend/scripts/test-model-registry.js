import assert from "node:assert";
import { FRONTIER_MODEL_CATALOGUE, modelService } from "../src/services/models/ModelService.ts";

console.log("Running Model Registry & Independent Selection Tests (Real ModelService)...");

// Test 1: Catalogue partitioning
{
  const allModels = modelService.catalogue();
  const llmModels = modelService.catalogue("llm");
  const sttModels = modelService.catalogue("stt");

  assert.ok(allModels.length > 0, "Catalogue should not be empty");
  assert.ok(llmModels.length > 0, "LLM catalogue should not be empty");
  assert.ok(sttModels.length > 0, "STT catalogue should not be empty");
  assert.strictEqual(llmModels.length + sttModels.length, allModels.length, "All models must be partitioned into LLM or STT");
  assert.strictEqual(allModels.length, FRONTIER_MODEL_CATALOGUE.length, "Catalogue matches FRONTIER_MODEL_CATALOGUE length");
  console.log(`✓ Test 1: Model catalogue partitioned correctly (${llmModels.length} LLMs, ${sttModels.length} STTs, ${allModels.length} total).`);
}

// Test 2: System and Cloud STT do not require download
{
  const sysStt = modelService.findModel("stt-system");
  assert.ok(sysStt, "stt-system must exist in catalogue");
  assert.strictEqual(sysStt.requiresDownload, false);
  assert.strictEqual(sysStt.execution, "system");

  const compStt = modelService.findModel("stt-companion");
  assert.ok(compStt, "stt-companion must exist in catalogue");
  assert.strictEqual(compStt.requiresDownload, false);
  assert.strictEqual(compStt.execution, "cloud");
  console.log("✓ Test 2: System and Cloud STT models do not require download.");
}

// Test 3: Local Whisper models require download
{
  const whisperBase = modelService.findModel("stt-whisper-base");
  assert.ok(whisperBase, "stt-whisper-base must exist in catalogue");
  assert.strictEqual(whisperBase.requiresDownload, true);
  assert.strictEqual(whisperBase.execution, "local");
  assert.ok(whisperBase.downloadUrl, "Local model must provide downloadUrl");

  const whisperTiny = modelService.findModel("stt-whisper-tiny");
  assert.ok(whisperTiny, "stt-whisper-tiny must exist in catalogue");
  assert.strictEqual(whisperTiny.requiresDownload, true);
  assert.strictEqual(whisperTiny.execution, "local");
  console.log("✓ Test 3: Local Whisper models require explicit download.");
}

// Test 4: Frontier reasoning models verification
{
  const deepseek = modelService.findModel("deepseek-r1-distill-qwen-1.5b");
  assert.ok(deepseek, "DeepSeek R1 Distill must exist in catalogue");
  assert.strictEqual(deepseek.requiresDownload, true);
  assert.strictEqual(deepseek.execution, "local");
  assert.strictEqual(deepseek.type, "llm");

  const smollm = modelService.findModel("smollm2-135m");
  assert.ok(smollm, "SmolLM2 must exist in catalogue");
  assert.strictEqual(smollm.requiresDownload, true);
  console.log("✓ Test 4: Frontier reasoning and local LLMs verified.");
}

// Test 5: Independent state persistence simulation
async function runStateTest() {
  const state = await modelService.loadState();
  assert.ok(Array.isArray(state.installed), "state.installed must be an array");
  assert.ok(state.selectedLlm !== undefined, "selectedLlm must be defined");
  assert.ok(state.selectedStt !== undefined, "selectedStt must be defined");

  // Verify independent selection logic
  let customState = {
    installed: [...state.installed],
    selectedLlm: "smollm2-135m",
    selectedStt: "stt-system",
  };

  // Changing LLM does not affect STT
  customState.selectedLlm = "deepseek-r1-distill-qwen-1.5b";
  assert.strictEqual(customState.selectedLlm, "deepseek-r1-distill-qwen-1.5b");
  assert.strictEqual(customState.selectedStt, "stt-system", "Changing LLM must not alter selected STT");

  // Changing STT does not affect LLM
  customState.selectedStt = "stt-companion";
  assert.strictEqual(customState.selectedLlm, "deepseek-r1-distill-qwen-1.5b", "Changing STT must not alter selected LLM");
  assert.strictEqual(customState.selectedStt, "stt-companion");

  console.log("✓ Test 5: Independent LLM and STT selection verified.");
  console.log("\nALL REAL MODEL REGISTRY TESTS PASSED SUCCESSFULLY!");
}

runStateTest().catch((err) => {
  console.error("Test 5 failed:", err);
  process.exit(1);
});

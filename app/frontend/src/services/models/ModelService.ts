import * as FS from "expo-file-system/legacy";
import { Paths } from "expo-file-system";
import { Platform } from "react-native";

import { apiRequest, isBackendConfigured } from "@/src/services/api";
import { nativeInference } from "@/src/services/native";
import { storage } from "@/src/utils/storage";

export type ModelType = "llm" | "stt";
export type ExecutionMode = "local" | "cloud" | "system";
export type ModelState = "available" | "downloading" | "installed" | "error" | "unavailable";

export interface ModelInfo {
  id: string;
  type: ModelType;
  provider: string;
  family: string;
  name: string;
  params: string;
  sizeBytes: number;
  format: string;
  quantization: string;
  languages: string[];
  execution: ExecutionMode;
  requiresDownload: boolean;
  compatibility: { level: "likely" | "unverified" | "unlikely"; note: string };
  hue: "brand" | "accent" | "success" | "warning" | "error";
  downloadUrl?: string;
}

export interface ModelRegistryState {
  installed: string[];
  selectedLlm: string | null;
  selectedStt: string | null;
}

export interface ModelService {
  readonly isSimulated: boolean;
  catalogue(type?: ModelType): ModelInfo[];
  findModel(id: string): ModelInfo | null;
  pathFor(id: string): string;
  loadState(): Promise<ModelRegistryState>;
  saveState(s: Partial<ModelRegistryState>): Promise<void>;
  download(id: string, onProgress: (p: number) => void): Promise<void>;
  delete(id: string): Promise<void>;
  availableBytes(): number | null;
}

const GB = 1024 ** 3;
const MODELS_DIR = (FS.documentDirectory ?? "") + "models/";

const SELECTED_LLM_KEY = "ova_selected_llm_model";
const SELECTED_STT_KEY = "ova_selected_stt_model";
const LEGACY_SELECTED_KEY = "ova_selected_model_v2";

export const MODEL_CATALOGUE: ModelInfo[] = [
  // ======================== LLM Models ========================
  {
    id: "smollm2-135m",
    type: "llm",
    provider: "Hugging Face",
    family: "SmolLM",
    name: "SmolLM2 135M Instruct",
    params: "135M",
    sizeBytes: 105487360,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "Smallest footprint · instant offline replies" },
    hue: "accent",
    downloadUrl: "https://huggingface.co/prithivMLmods/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct.Q4_K_M.gguf",
  },
  {
    id: "qwen2.5-0.5b",
    type: "llm",
    provider: "Alibaba",
    family: "Qwen",
    name: "Qwen 2.5 0.5B Instruct",
    params: "0.5B",
    sizeBytes: 491384832,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "ZH", "+27"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "High precision · fits 2 GB RAM" },
    hue: "success",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
  },
  {
    id: "tinyllama-1.1b",
    type: "llm",
    provider: "TheBloke",
    family: "TinyLlama",
    name: "TinyLlama 1.1B Chat",
    params: "1.1B",
    sizeBytes: 668782592,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "Fast chat engine · fits 3 GB RAM" },
    hue: "brand",
    downloadUrl: "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
  },
  {
    id: "qwen2.5-1.5b",
    type: "llm",
    provider: "Alibaba",
    family: "Qwen",
    name: "Qwen 2.5 1.5B Instruct",
    params: "1.5B",
    sizeBytes: 1117392896,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "ZH", "+27"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "Balanced reasoning · fits 4 GB RAM" },
    hue: "success",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
  },
  {
    id: "llama3.2-1b",
    type: "llm",
    provider: "Meta",
    family: "Llama",
    name: "Llama 3.2 1B Instruct",
    params: "1B",
    sizeBytes: 807759872,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "DE", "FR", "HI", "+4"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "Meta's compact model · fast replies" },
    hue: "brand",
    downloadUrl: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
  },
  {
    id: "llama3.2-3b",
    type: "llm",
    provider: "Meta",
    family: "Llama",
    name: "Llama 3.2 3B Instruct",
    params: "3B",
    sizeBytes: 2019448832,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "DE", "FR", "HI", "+4"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "unverified", note: "Needs ~4 GB free RAM · deep reasoning" },
    hue: "warning",
    downloadUrl: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
  },
  {
    id: "phi3.5-mini",
    type: "llm",
    provider: "Microsoft",
    family: "Phi",
    name: "Phi-3.5 Mini Instruct",
    params: "3.8B",
    sizeBytes: 2393231360,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "+20"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "unverified", note: "High reasoning · needs 4–6 GB RAM" },
    hue: "warning",
    downloadUrl: "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
  },
  {
    id: "llm-companion",
    type: "llm",
    provider: "Companion Server",
    family: "Remote LLM",
    name: "Companion Backend LLM",
    params: "Cloud/LAN",
    sizeBytes: 0,
    format: "FastAPI",
    quantization: "Server-side",
    languages: ["EN", "Multi"],
    execution: "cloud",
    requiresDownload: false,
    compatibility: { level: "likely", note: "Delegates reasoning to companion server · 0 MB local storage" },
    hue: "brand",
  },

  // ======================== Speech-to-Text Models ========================
  {
    id: "stt-system",
    type: "stt",
    provider: "Android System",
    family: "System STT",
    name: "System Speech Recognizer",
    params: "Built-in",
    sizeBytes: 0,
    format: "Android API",
    quantization: "Native",
    languages: ["EN", "Multi"],
    execution: "system",
    requiresDownload: false,
    compatibility: { level: "likely", note: "On-device Android system speech recognizer · No download required" },
    hue: "success",
  },
  {
    id: "stt-whisper-base",
    type: "stt",
    provider: "OpenAI / whisper.cpp",
    family: "Whisper",
    name: "Whisper Base (English)",
    params: "74M",
    sizeBytes: 147951465, // ~141 MB
    format: "GGML",
    quantization: "Q16",
    languages: ["EN"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "Private, high accuracy offline STT · 141 MB download" },
    hue: "brand",
    downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
  },
  {
    id: "stt-whisper-tiny",
    type: "stt",
    provider: "OpenAI / whisper.cpp",
    family: "Whisper",
    name: "Whisper Tiny (English)",
    params: "39M",
    sizeBytes: 77712441, // ~74 MB
    format: "GGML",
    quantization: "Q16",
    languages: ["EN"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "Ultra-compact offline STT · 74 MB download" },
    hue: "accent",
    downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
  },
  {
    id: "stt-companion",
    type: "stt",
    provider: "Companion Server",
    family: "Remote STT",
    name: "Companion Whisper STT",
    params: "Cloud/LAN",
    sizeBytes: 0,
    format: "FastAPI Whisper",
    quantization: "FP16",
    languages: ["EN", "Multi"],
    execution: "cloud",
    requiresDownload: false,
    compatibility: { level: "likely", note: "Transcribes on companion backend · No local storage used" },
    hue: "brand",
  },
];

async function ensureDir(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const info = await FS.getInfoAsync(MODELS_DIR);
    if (!info.exists) await FS.makeDirectoryAsync(MODELS_DIR, { intermediates: true });
  } catch {
    /* ignore */
  }
}

class HybridModelService implements ModelService {
  readonly isSimulated = false;

  catalogue(type?: ModelType): ModelInfo[] {
    if (!type) return MODEL_CATALOGUE;
    return MODEL_CATALOGUE.filter((m) => m.type === type);
  }

  findModel(id: string): ModelInfo | null {
    return MODEL_CATALOGUE.find((m) => m.id === id) ?? null;
  }

  pathFor(id: string): string {
    const m = this.findModel(id);
    if (m?.type === "stt") {
      return `${MODELS_DIR}${id}.bin`;
    }
    return `${MODELS_DIR}${id}.gguf`;
  }

  private async isModelInstalledOnDisk(m: ModelInfo): Promise<boolean> {
    if (!m.requiresDownload) return true;
    if (Platform.OS === "web") return false;
    try {
      const info = await FS.getInfoAsync(this.pathFor(m.id));
      return Boolean(info.exists && (info.size ?? 0) > 1024 * 1024);
    } catch {
      return false;
    }
  }

  async loadState(): Promise<ModelRegistryState> {
    const installed: string[] = [];

    for (const m of MODEL_CATALOGUE) {
      if (await this.isModelInstalledOnDisk(m)) {
        installed.push(m.id);
      }
    }

    // Load persisted selections
    let selectedLlm = await storage.getItem<string | null>(SELECTED_LLM_KEY, null);
    if (!selectedLlm) {
      // Fallback check for legacy key
      selectedLlm = await storage.getItem<string | null>(LEGACY_SELECTED_KEY, null);
    }

    // Verify LLM validity
    const installedLlms = installed.filter((id) => this.findModel(id)?.type === "llm");
    if (!selectedLlm || !installed.includes(selectedLlm)) {
      selectedLlm = installedLlms[0] ?? null;
    }

    // Load persisted STT selection (NEVER auto-download a model)
    const selectedStt = await storage.getItem<string | null>(SELECTED_STT_KEY, null);

    return {
      installed,
      selectedLlm,
      selectedStt,
    };
  }

  async saveState(s: Partial<ModelRegistryState>): Promise<void> {
    if (s.selectedLlm !== undefined) {
      await storage.setItem(SELECTED_LLM_KEY, s.selectedLlm);
      await storage.setItem(LEGACY_SELECTED_KEY, s.selectedLlm);
      if (s.selectedLlm && isBackendConfigured()) {
        try {
          await apiRequest(`api/models/select/${s.selectedLlm}`, { method: "POST" });
        } catch {
          /* ignore */
        }
      }
    }
    if (s.selectedStt !== undefined) {
      await storage.setItem(SELECTED_STT_KEY, s.selectedStt);
    }
  }

  async download(id: string, onProgress: (p: number) => void): Promise<void> {
    const model = this.findModel(id);
    if (!model) throw new Error("Unknown model ID");
    if (!model.requiresDownload || !model.downloadUrl) {
      onProgress(1.0);
      return;
    }

    if (model.compatibility.level === "unlikely") {
      throw new Error("Blocked: estimated memory need exceeds this device class");
    }

    await ensureDir();
    const dest = this.pathFor(id);
    onProgress(0.01);

    const resumable = FS.createDownloadResumable(model.downloadUrl, dest, {}, (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        onProgress(Math.min(0.99, Math.max(0.02, p.totalBytesWritten / p.totalBytesExpectedToWrite)));
      }
    });

    try {
      const result = await resumable.downloadAsync();
      if (!result) throw new Error("Download did not complete");
      onProgress(1);
    } catch (e) {
      await FS.deleteAsync(dest, { idempotent: true }).catch(() => {});
      throw e;
    }
  }

  async delete(id: string): Promise<void> {
    const model = this.findModel(id);
    if (!model || !model.requiresDownload) return;
    await FS.deleteAsync(this.pathFor(id), { idempotent: true }).catch(() => {});
  }

  availableBytes(): number | null {
    try {
      const b = Paths.availableDiskSpace;
      return typeof b === "number" && b > 0 ? b : 25 * GB;
    } catch {
      return 25 * GB;
    }
  }
}

export const modelService: ModelService = new HybridModelService();

// Legacy backward-compatibility alias for on-device whisper path
export const speechModel = {
  get path() {
    return modelService.pathFor("stt-whisper-base");
  },
  sizeBytes: 147951465,
  nativeAvailable(): boolean {
    return nativeInference.whisperAvailable;
  },
  async isInstalled(): Promise<boolean> {
    const state = await modelService.loadState();
    return state.installed.includes("stt-whisper-base");
  },
  async download(onProgress: (p: number) => void): Promise<void> {
    return modelService.download("stt-whisper-base", onProgress);
  },
  async remove(): Promise<void> {
    return modelService.delete("stt-whisper-base");
  },
};

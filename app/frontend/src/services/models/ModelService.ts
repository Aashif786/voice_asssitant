import type { apiRequest as ApiRequestType, isBackendConfigured as IsBackendConfiguredType } from "@/src/services/api";
import type { storage as StorageType } from "@/src/utils/storage";

declare const require: any;

let FS: any;
try {
  FS = require("expo-file-system/legacy");
} catch {
  FS = { documentDirectory: "" };
}

let Paths: any;
try {
  Paths = require("expo-file-system").Paths;
} catch {
  Paths = { availableDiskSpace: null };
}

let Platform: any;
try {
  Platform = require("react-native").Platform;
} catch {
  Platform = { OS: "web" };
}

let apiRequest: typeof ApiRequestType = (() => Promise.resolve({ data: null, error: null })) as any;
let isBackendConfigured: typeof IsBackendConfiguredType = (() => false) as any;
let getBackendUrl: () => string | null = (() => null);
try {
  const api = require("@/src/services/api");
  apiRequest = api.apiRequest;
  isBackendConfigured = api.isBackendConfigured;
  getBackendUrl = api.getBackendUrl;
} catch {}

let nativeInference: any;
try {
  nativeInference = require("@/src/services/native").nativeInference;
} catch {}

let storage: typeof StorageType = {
  getItem: ((_k: any, fb: any) => Promise.resolve(fb)) as any,
  setItem: (() => Promise.resolve(true)) as any,
} as any;
try {
  storage = require("@/src/utils/storage").storage;
} catch {}

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
  syncFromBackend(): Promise<ModelInfo[]>;
  discoverFromProvider(query: string, type?: ModelType): Promise<ModelInfo[]>;
}

const MODELS_DIR = (FS.documentDirectory ?? "") + "models/";

const SELECTED_LLM_KEY = "ova_selected_llm_model";
const SELECTED_STT_KEY = "ova_selected_stt_model";
const LEGACY_SELECTED_KEY = "ova_selected_model_v2";

export const FRONTIER_MODEL_CATALOGUE: ModelInfo[] = [
  // ======================== Frontier LLM Models ========================
  {
    id: "deepseek-r1-distill-qwen-1.5b",
    type: "llm",
    provider: "DeepSeek",
    family: "DeepSeek",
    name: "DeepSeek R1 Distill Qwen 1.5B",
    params: "1.5B",
    sizeBytes: 1117392896,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "ZH", "+20"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "Frontier reasoning model · Fits 3 GB RAM" },
    hue: "accent",
    downloadUrl: "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf",
  },
  {
    id: "deepseek-r1-distill-qwen-7b",
    type: "llm",
    provider: "DeepSeek",
    family: "DeepSeek",
    name: "DeepSeek R1 Distill Qwen 7B",
    params: "7B",
    sizeBytes: 4683074240,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "ZH", "+20"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "unverified", note: "Deep reasoning powerhouse · Needs 6–8 GB RAM" },
    hue: "warning",
    downloadUrl: "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf",
  },
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
    id: "qwen2.5-coder-1.5b",
    type: "llm",
    provider: "Alibaba",
    family: "Qwen",
    name: "Qwen 2.5 Coder 1.5B",
    params: "1.5B",
    sizeBytes: 1117392896,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "Code"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "Code, tool calling & structured action specialist" },
    hue: "brand",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf",
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
    id: "phi4-mini-3.8b",
    type: "llm",
    provider: "Microsoft",
    family: "Phi",
    name: "Phi-4 Mini 3.8B Instruct",
    params: "3.8B",
    sizeBytes: 2490000000,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "+20"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "unverified", note: "Microsoft's latest frontier small language model" },
    hue: "warning",
    downloadUrl: "https://huggingface.co/bartowski/microsoft_phi-4-mini-instruct-GGUF/resolve/main/microsoft_phi-4-mini-instruct-Q4_K_M.gguf",
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
  {
    id: "gemini-2.5-flash",
    type: "llm",
    provider: "Google Cloud",
    family: "Gemini",
    name: "Gemini 2.5 Flash",
    params: "Frontier Cloud",
    sizeBytes: 0,
    format: "Cloud API",
    quantization: "FP16",
    languages: ["EN", "Multi (+100)"],
    execution: "cloud",
    requiresDownload: false,
    compatibility: { level: "likely", note: "Google frontier multimodal model via companion API" },
    hue: "brand",
  },

  // ======================== Frontier STT Models ========================
  {
    id: "stt-system",
    type: "stt",
    provider: "System Native",
    family: "System STT",
    name: "System Speech Recognizer",
    params: "Built-in",
    sizeBytes: 0,
    format: "Native API",
    quantization: "Native",
    languages: ["EN", "Multi"],
    execution: "system",
    requiresDownload: false,
    compatibility: { level: "likely", note: "On-device system speech recognizer · No download required" },
    hue: "success",
  },
  {
    id: "stt-whisper-tiny",
    type: "stt",
    provider: "OpenAI / whisper.cpp",
    family: "Whisper",
    name: "Whisper Tiny (English)",
    params: "39M",
    sizeBytes: 77712441,
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
    id: "stt-whisper-base",
    type: "stt",
    provider: "OpenAI / whisper.cpp",
    family: "Whisper",
    name: "Whisper Base (English)",
    params: "74M",
    sizeBytes: 147951465,
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
    id: "stt-whisper-small",
    type: "stt",
    provider: "OpenAI / whisper.cpp",
    family: "Whisper",
    name: "Whisper Small (Multilingual)",
    params: "244M",
    sizeBytes: 487951465,
    format: "GGML",
    quantization: "Q16",
    languages: ["EN", "Multi (+99)"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "High-accuracy multilingual STT · ~465 MB" },
    hue: "brand",
    downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
  },
  {
    id: "stt-whisper-medium",
    type: "stt",
    provider: "OpenAI / whisper.cpp",
    family: "Whisper",
    name: "Whisper Medium (English)",
    params: "769M",
    sizeBytes: 1530000000,
    format: "GGML",
    quantization: "Q16",
    languages: ["EN"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "High-accuracy English STT · ~1.5 GB" },
    hue: "brand",
    downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
  },
  {
    id: "stt-whisper-large-v3-turbo",
    type: "stt",
    provider: "OpenAI / whisper.cpp",
    family: "Whisper Frontier",
    name: "Whisper Large v3 Turbo",
    params: "809M",
    sizeBytes: 1620000000,
    format: "GGML",
    quantization: "Q16",
    languages: ["EN", "Multi (+100)"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "OpenAI's latest frontier Whisper model · 8x faster" },
    hue: "accent",
    downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
  },
  {
    id: "stt-distil-whisper-large-v3",
    type: "stt",
    provider: "Hugging Face",
    family: "Distil-Whisper",
    name: "Distil-Whisper Large v3",
    params: "756M",
    sizeBytes: 1510000000,
    format: "CTranslate2",
    quantization: "INT8",
    languages: ["EN"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "6x faster than Whisper-large with 99% accuracy" },
    hue: "success",
    downloadUrl: "https://huggingface.co/Systran/faster-distil-whisper-large-v3/resolve/main/model.bin",
  },
  {
    id: "stt-moonshine-base",
    type: "stt",
    provider: "Useful Sensors",
    family: "Moonshine",
    name: "Moonshine Base STT",
    params: "100M",
    sizeBytes: 200000000,
    format: "ONNX",
    quantization: "INT8",
    languages: ["EN"],
    execution: "local",
    requiresDownload: true,
    compatibility: { level: "likely", note: "Frontier real-time edge speech recognition" },
    hue: "brand",
    downloadUrl: "https://huggingface.co/UsefulSensors/moonshine/resolve/main/base.tar.gz",
  },
  {
    id: "stt-companion",
    type: "stt",
    provider: "Companion Server",
    family: "Remote STT",
    name: "Companion Faster-Whisper",
    params: "Cloud/LAN",
    sizeBytes: 0,
    format: "FastAPI Whisper",
    quantization: "INT8/FP16",
    languages: ["EN", "Multi"],
    execution: "cloud",
    requiresDownload: false,
    compatibility: { level: "likely", note: "Server-side faster-whisper transcription · No local storage used" },
    hue: "brand",
  },
];

async function ensureDir(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const dir = MODELS_DIR.endsWith("/") ? MODELS_DIR.slice(0, -1) : MODELS_DIR;
    const info = await FS.getInfoAsync(dir);
    if (!info.exists) await FS.makeDirectoryAsync(MODELS_DIR, { intermediates: true });
  } catch {
    /* ignore */
  }
}

class HybridModelService implements ModelService {
  readonly isSimulated = false;
  private dynamicModels: ModelInfo[] = [];

  catalogue(type?: ModelType): ModelInfo[] {
    const combined = [...FRONTIER_MODEL_CATALOGUE];
    for (const d of this.dynamicModels) {
      if (!combined.some((m) => m.id === d.id)) {
        combined.push(d);
      }
    }
    if (!type) return combined;
    return combined.filter((m) => m.type === type);
  }

  findModel(id: string): ModelInfo | null {
    return this.catalogue().find((m) => m.id === id) ?? null;
  }

  pathFor(id: string): string {
    const m = this.findModel(id);
    if (m?.type === "stt") {
      return `${MODELS_DIR}${id}.bin`;
    }
    return `${MODELS_DIR}${id}.gguf`;
  }

  async syncFromBackend(): Promise<ModelInfo[]> {
    if (!isBackendConfigured()) return this.catalogue();
    try {
      const res = await apiRequest<ModelInfo[]>("api/models/catalogue");
      if (res.data && Array.isArray(res.data)) {
        this.dynamicModels = res.data;
        return this.catalogue();
      }
    } catch {
      /* ignore */
    }
    return this.catalogue();
  }

  async discoverFromProvider(query: string, type?: ModelType): Promise<ModelInfo[]> {
    if (!query) return this.catalogue(type);
    if (isBackendConfigured()) {
      try {
        const res = await apiRequest<ModelInfo[]>(
          `api/models/discover?query=${encodeURIComponent(query)}&type=${type || "all"}&limit=25`
        );
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
          for (const item of res.data) {
            if (!this.dynamicModels.some((m) => m.id === item.id)) {
              this.dynamicModels.push(item);
            }
          }
          return res.data;
        }
      } catch {
        /* ignore */
      }
    }

    // Client-side Hugging Face API discovery fallback
    try {
      const tag = type === "stt" ? "automatic-speech-recognition" : "text-generation";
      const hfRes = await fetch(
        `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&pipeline_tag=${tag}&sort=downloads&direction=-1&limit=25&expand[]=siblings`
      );
      if (hfRes.ok) {
        const items = await hfRes.json();
        const discovered: ModelInfo[] = [];
        for (const it of items) {
          const mid = it.id || "";
          if (!mid) continue;
          const repoName = mid.split("/").pop() || mid;
          const author = mid.split("/")[0] || "Hugging Face";
          const isStt = type === "stt" || repoName.toLowerCase().includes("whisper") || repoName.toLowerCase().includes("speech");
          const mType: ModelType = isStt ? "stt" : "llm";
          const siblings: string[] = (it.siblings || []).map((s: any) => s.rfilename || "");

          let targetFile: string | null = null;
          let quant = "Dynamic";

          if (mType === "llm") {
            const ggufs = siblings.filter((f) => f.toLowerCase().endsWith(".gguf"));
            if (ggufs.length > 0) {
              const pref = ["q4_k_m", "q4_0", "q4_1", "q5_k_m", "q5_0", "q8_0", "f16"];
              for (const p of pref) {
                const match = ggufs.find((f) => f.toLowerCase().includes(p));
                if (match) {
                  targetFile = match;
                  quant = p.toUpperCase();
                  break;
                }
              }
              if (!targetFile) targetFile = ggufs[0];
            }
          } else {
            const bins = siblings.filter((f) => f.toLowerCase().endsWith(".bin") && !f.endsWith(".mlmodelc.zip"));
            if (bins.length > 0) {
              targetFile = bins[0];
              quant = "Q16";
            }
          }

          const cleanId = `hf-${repoName.toLowerCase()}-${quant.toLowerCase()}`.replace(/[^a-z0-9]/g, "-");
          const downloadUrl = targetFile
            ? `https://huggingface.co/${mid}/resolve/main/${targetFile}`
            : `https://huggingface.co/${mid}/resolve/main/${repoName}.${mType === "stt" ? "bin" : "gguf"}`;

          const entry: ModelInfo = {
            id: cleanId,
            type: mType,
            provider: author,
            family: repoName.split("-")[0].toUpperCase(),
            name: repoName.replace(/-/g, " ") + (quant !== "Dynamic" ? ` (${quant})` : ""),
            params: "Frontier",
            sizeBytes: 1024 * 1024 * (mType === "stt" ? 500 : 1200),
            format: mType === "llm" ? "GGUF" : "GGML",
            quantization: quant,
            languages: ["EN", "Multi"],
            execution: "local",
            requiresDownload: true,
            compatibility: { level: "likely", note: `Discovered from Hugging Face: ${mid}` },
            hue: "accent",
            downloadUrl,
          };
          discovered.push(entry);
          if (!this.dynamicModels.some((m) => m.id === entry.id)) {
            this.dynamicModels.push(entry);
          }
        }
        return discovered;
      }
    } catch {
      /* ignore */
    }

    return this.catalogue(type).filter(
      (m) =>
        m.name.toLowerCase().includes(query.toLowerCase()) ||
        m.family.toLowerCase().includes(query.toLowerCase()) ||
        m.provider.toLowerCase().includes(query.toLowerCase())
    );
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
    // Try syncing catalogue and installed state from backend
    let backendInstalled: string[] = [];
    let backendSelected: string | null = null;
    if (isBackendConfigured()) {
      try {
        const [stateRes, catRes] = await Promise.all([
          apiRequest<{ installed: string[]; selected: string | null }>("api/models/state"),
          apiRequest<ModelInfo[]>("api/models/catalogue"),
        ]);
        if (stateRes.data) {
          backendInstalled = stateRes.data.installed || [];
          backendSelected = stateRes.data.selected || null;
        }
        if (catRes.data && Array.isArray(catRes.data)) {
          this.dynamicModels = catRes.data;
        }
      } catch {
        /* ignore */
      }
    }

    const installed: string[] = [];

    // On native platforms (Android/iOS), a local model is installed IF AND ONLY IF its weights exist on disk.
    // Built-in system or cloud models do not require download.
    // On Web, model execution delegates to companion backend, so backendInstalled applies.
    for (const m of this.catalogue()) {
      if (!m.requiresDownload) {
        installed.push(m.id);
      } else if (Platform.OS === "web") {
        if (backendInstalled.includes(m.id)) {
          installed.push(m.id);
        }
      } else {
        if (await this.isModelInstalledOnDisk(m)) {
          installed.push(m.id);
        }
      }
    }

    // Load persisted selections
    let selectedLlm = await storage.getItem<string | null>(SELECTED_LLM_KEY, null);
    if (!selectedLlm) {
      selectedLlm = backendSelected || (await storage.getItem<string | null>(LEGACY_SELECTED_KEY, null));
    }

    const installedLlms = installed.filter((id) => this.findModel(id)?.type === "llm");
    if (!selectedLlm || (!installed.includes(selectedLlm) && selectedLlm !== "llm-companion")) {
      selectedLlm = installedLlms[0] ?? null;
    }

    let selectedStt = await storage.getItem<string | null>(SELECTED_STT_KEY, null);
    if (!selectedStt || (!installed.includes(selectedStt) && selectedStt !== "stt-system" && selectedStt !== "stt-companion")) {
      selectedStt = "stt-system";
    }

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
      if (s.selectedStt && isBackendConfigured() && s.selectedStt.startsWith("stt-whisper")) {
        try {
          await apiRequest(`api/voice/select/${s.selectedStt.replace("stt-whisper-", "")}`, { method: "POST" });
        } catch {
          /* ignore */
        }
      }
    }
  }

  async download(id: string, onProgress: (p: number) => void): Promise<void> {
    const model = this.findModel(id);
    if (!model) throw new Error("Unknown model ID");
    if (!model.requiresDownload) {
      onProgress(1.0);
      return;
    }

    onProgress(0.02);

    // On Web, native offline models cannot run in-browser; delegate download to companion backend
    if (Platform.OS === "web") {
      if (!isBackendConfigured()) {
        throw new Error("Local model downloads on Web require the Companion Backend to be running.");
      }
      try {
        const startRes = await apiRequest<{ status: string; message?: string }>(`api/models/download/${id}`, {
          method: "POST",
        });
        if (startRes.error) {
          throw new Error(startRes.error);
        }

        const maxPollAttempts = 1200;
        for (let i = 0; i < maxPollAttempts; i++) {
          await new Promise((r) => setTimeout(r, 800));
          const progRes = await apiRequest<{ progress: number; status: string; error?: string }>(
            `api/models/progress/${id}`
          );
          if (progRes.data) {
            onProgress(progRes.data.progress);
            if (
              progRes.data.status === "completed" ||
              progRes.data.status === "installed" ||
              progRes.data.progress >= 1.0
            ) {
              onProgress(1.0);
              return;
            }
            if (progRes.data.status === "error") {
              throw new Error(progRes.data.error || "Download failed on backend");
            }
          }
        }
        onProgress(1.0);
        return;
      } catch (err: any) {
        throw err;
      }
    }

    // On Native mobile (Android / iOS): Model weights MUST be downloaded into local device storage
    await ensureDir();
    const dest = this.pathFor(id);
    onProgress(0.02);

    // High-speed transfer: Check if companion backend is running and already has the model file
    let downloadSourceUrl = model.downloadUrl;
    if (isBackendConfigured()) {
      try {
        const backendBase = getBackendUrl();
        if (backendBase) {
          const checkRes = await fetch(`${backendBase}/api/models/file/${id}`, { method: "HEAD" });
          if (checkRes.ok) {
            downloadSourceUrl = `${backendBase}/api/models/file/${id}`;
          }
        }
      } catch {
        /* fallback to model.downloadUrl */
      }
    }

    if (!downloadSourceUrl) {
      throw new Error("No download URL available for this model");
    }

    const resumable = FS.createDownloadResumable(downloadSourceUrl, dest, {}, (p: any) => {
      if (p.totalBytesExpectedToWrite > 0) {
        onProgress(Math.min(0.99, Math.max(0.02, p.totalBytesWritten / p.totalBytesExpectedToWrite)));
      }
    });

    try {
      const result = await resumable.downloadAsync();
      if (!result) throw new Error("Download did not complete");

      // Verify file is genuinely on disk and has non-trivial size
      const info = await FS.getInfoAsync(dest);
      if (!info.exists || (info.size ?? 0) < 1024 * 1024) {
        throw new Error("Downloaded model file is incomplete or corrupted");
      }
      onProgress(1.0);
    } catch (e) {
      await FS.deleteAsync(dest, { idempotent: true }).catch(() => {});
      throw e;
    }
  }

  async delete(id: string): Promise<void> {
    const model = this.findModel(id);
    if (!model || !model.requiresDownload) return;

    if (isBackendConfigured()) {
      try {
        await apiRequest(`api/models/${id}`, { method: "DELETE" });
      } catch {
        /* ignore */
      }
    }

    if (Platform.OS !== "web") {
      await FS.deleteAsync(this.pathFor(id), { idempotent: true }).catch(() => {});
    }
  }

  availableBytes(): number | null {
    try {
      const b = Paths.availableDiskSpace;
      return typeof b === "number" && b > 0 ? b : null;
    } catch {
      return null;
    }
  }
}

export const modelService: ModelService = new HybridModelService();

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

import * as FS from "expo-file-system/legacy";
import { Paths } from "expo-file-system";
import { Platform } from "react-native";

import { apiRequest, isBackendConfigured } from "@/src/services/api";
import { nativeInference } from "@/src/services/native";
import { storage } from "@/src/utils/storage";

export type ModelState = "available" | "downloading" | "installed" | "error";

export interface ModelInfo {
  id: string;
  family: string;
  name: string;
  params: string;
  sizeBytes: number;
  format: string;
  quantization: string;
  languages: string[];
  compatibility: { level: "likely" | "unverified" | "unlikely"; note: string };
  hue: "brand" | "accent" | "success" | "warning" | "error";
  downloadUrl: string;
}

export interface ModelService {
  readonly isSimulated: boolean;
  catalogue(): ModelInfo[];
  pathFor(id: string): string;
  loadState(): Promise<{ installed: string[]; selected: string | null }>;
  saveState(s: { installed: string[]; selected: string | null }): Promise<void>;
  download(id: string, onProgress: (p: number) => void): Promise<void>;
  delete(id: string): Promise<void>;
  availableBytes(): number | null;
}

const GB = 1024 ** 3;
const MODELS_DIR = (FS.documentDirectory ?? "") + "models/";
const SELECTED_KEY = "ova_selected_model_v2";

const CATALOGUE: ModelInfo[] = [
  {
    id: "smollm2-135m", family: "SmolLM", name: "SmolLM2 135M Instruct", params: "135M",
    sizeBytes: 105487360, format: "GGUF", quantization: "Q4_K_M", languages: ["EN"],
    compatibility: { level: "likely", note: "Smallest footprint · instant replies" }, hue: "accent",
    downloadUrl: "https://huggingface.co/prithivMLmods/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct.Q4_K_M.gguf",
  },
  {
    id: "qwen2.5-0.5b", family: "Qwen", name: "Qwen 2.5 0.5B Instruct", params: "0.5B",
    sizeBytes: 491384832, format: "GGUF", quantization: "Q4_K_M", languages: ["EN", "ZH", "+27"],
    compatibility: { level: "likely", note: "High precision · fits 2 GB RAM" }, hue: "success",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
  },
  {
    id: "tinyllama-1.1b", family: "TinyLlama", name: "TinyLlama 1.1B Chat", params: "1.1B",
    sizeBytes: 668782592, format: "GGUF", quantization: "Q4_K_M", languages: ["EN"],
    compatibility: { level: "likely", note: "Fast chat engine · fits 3 GB RAM" }, hue: "brand",
    downloadUrl: "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
  },
  {
    id: "qwen2.5-1.5b", family: "Qwen", name: "Qwen 2.5 1.5B Instruct", params: "1.5B",
    sizeBytes: 1117392896, format: "GGUF", quantization: "Q4_K_M", languages: ["EN", "ZH", "+27"],
    compatibility: { level: "likely", note: "Balanced reasoning · fits 4 GB RAM" }, hue: "success",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
  },
  {
    id: "llama3.2-1b", family: "Llama", name: "Llama 3.2 1B Instruct", params: "1B",
    sizeBytes: 807759872, format: "GGUF", quantization: "Q4_K_M", languages: ["EN", "DE", "FR", "HI", "+4"],
    compatibility: { level: "likely", note: "Meta's compact model · fast replies" }, hue: "brand",
    downloadUrl: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
  },
  {
    id: "llama3.2-3b", family: "Llama", name: "Llama 3.2 3B Instruct", params: "3B",
    sizeBytes: 2019448832, format: "GGUF", quantization: "Q4_K_M", languages: ["EN", "DE", "FR", "HI", "+4"],
    compatibility: { level: "unverified", note: "Needs ~4 GB free RAM · deep reasoning" }, hue: "warning",
    downloadUrl: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
  },
  {
    id: "phi3.5-mini", family: "Phi", name: "Phi-3.5 Mini Instruct", params: "3.8B",
    sizeBytes: 2393231360, format: "GGUF", quantization: "Q4_K_M", languages: ["EN", "+20"],
    compatibility: { level: "unverified", note: "High reasoning · needs 4–6 GB RAM" }, hue: "warning",
    downloadUrl: "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
  },
  {
    id: "qwen2.5-7b", family: "Qwen", name: "Qwen 2.5 7B Instruct", params: "7B",
    sizeBytes: 4683074240, format: "GGUF", quantization: "Q4_K_M", languages: ["EN", "ZH", "+27"],
    compatibility: { level: "unlikely", note: "Needs ~8 GB RAM; high-end devices only" }, hue: "error",
    downloadUrl: "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf",
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

class OnDeviceModelService implements ModelService {
  readonly isSimulated = false;

  catalogue(): ModelInfo[] {
    return CATALOGUE;
  }

  pathFor(id: string): string {
    return `${MODELS_DIR}${id}.gguf`;
  }

  private async installedIds(): Promise<string[]> {
    const ids: string[] = [];
    for (const m of CATALOGUE) {
      try {
        const info = await FS.getInfoAsync(this.pathFor(m.id));
        if (info.exists && (info.size ?? 0) > 1024 * 1024) ids.push(m.id);
      } catch {
        /* ignore */
      }
    }
    return ids;
  }

  async loadState(): Promise<{ installed: string[]; selected: string | null }> {
    const installed = await this.installedIds();
    const stored = await storage.getItem<string | null>(SELECTED_KEY, null);
    const selected = stored && installed.includes(stored) ? stored : installed[0] ?? null;
    return { installed, selected };
  }

  async saveState(s: { installed: string[]; selected: string | null }): Promise<void> {
    await storage.setItem(SELECTED_KEY, s.selected);
  }

  async download(id: string, onProgress: (p: number) => void): Promise<void> {
    const model = CATALOGUE.find((m) => m.id === id);
    if (!model) throw new Error("Unknown model");
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

class ConnectedModelService implements ModelService {
  readonly isSimulated = false;

  catalogue(): ModelInfo[] {
    return CATALOGUE;
  }

  pathFor(id: string): string {
    return id;
  }

  async loadState(): Promise<{ installed: string[]; selected: string | null }> {
    try {
      const res = await apiRequest<{ installed: string[]; selected: string | null }>("api/models/state");
      if (res.data) {
        return {
          installed: res.data.installed || [],
          selected: res.data.selected || null,
        };
      }
    } catch {}
    const stored = await storage.getItem<string | null>(SELECTED_KEY, null);
    return { installed: [], selected: stored };
  }

  async saveState(s: { installed: string[]; selected: string | null }): Promise<void> {
    await storage.setItem(SELECTED_KEY, s.selected);
    if (s.selected) {
      try {
        await apiRequest(`api/models/select/${s.selected}`, { method: "POST" });
      } catch {}
    }
  }

  async download(id: string, onProgress: (p: number) => void): Promise<void> {
    onProgress(0.02);
    let done = false;
    const poll = setInterval(async () => {
      if (done) return;
      try {
        const progRes = await apiRequest<{ progress: number; status: string }>(`api/models/progress/${id}`);
        if (progRes.data?.progress !== undefined) {
          const val = Math.max(0.02, Math.min(progRes.data.progress, 0.99));
          onProgress(val);
          if (progRes.data.status === "completed") {
            done = true;
          }
        }
      } catch {}
    }, 400);

    try {
      const res = await apiRequest(`api/models/download/${id}`, { method: "POST" });
      if (res.error) throw new Error(res.error);
      onProgress(1.0);
    } finally {
      done = true;
      clearInterval(poll);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await apiRequest(`api/models/${id}`, { method: "DELETE" });
    } catch {}
  }

  availableBytes(): number | null {
    return 25 * GB;
  }
}

class HybridModelService implements ModelService {
  private local = new OnDeviceModelService();
  private connected = new ConnectedModelService();

  private active(): ModelService {
    if (Platform.OS === "web" || (!nativeInference.llamaAvailable && isBackendConfigured())) {
      return this.connected;
    }
    return this.local;
  }

  get isSimulated(): boolean {
    return this.active().isSimulated;
  }

  catalogue(): ModelInfo[] {
    return this.active().catalogue();
  }

  pathFor(id: string): string {
    return this.active().pathFor(id);
  }

  loadState(): Promise<{ installed: string[]; selected: string | null }> {
    return this.active().loadState();
  }

  saveState(s: { installed: string[]; selected: string | null }): Promise<void> {
    return this.active().saveState(s);
  }

  download(id: string, onProgress: (p: number) => void): Promise<void> {
    return this.active().download(id, onProgress);
  }

  delete(id: string): Promise<void> {
    return this.active().delete(id);
  }

  availableBytes(): number | null {
    return this.active().availableBytes();
  }
}

export const modelService: ModelService = new HybridModelService();

// ---- On-device speech (Whisper) model, managed separately from chat models. ----
const SPEECH_PATH = `${MODELS_DIR}whisper-base-en.bin`;
const SPEECH_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";

export const speechModel = {
  path: SPEECH_PATH,
  sizeBytes: 147951465, // ~141 MB (ggml-base.en)
  nativeAvailable(): boolean {
    return nativeInference.whisperAvailable;
  },
  async isInstalled(): Promise<boolean> {
    if (Platform.OS === "web") return false;
    try {
      const info = await FS.getInfoAsync(SPEECH_PATH);
      return info.exists && (info.size ?? 0) > 1024 * 1024;
    } catch {
      return false;
    }
  },
  async download(onProgress: (p: number) => void): Promise<void> {
    if (Platform.OS === "web") {
      onProgress(1);
      return;
    }
    await ensureDir();
    onProgress(0.01);
    const resumable = FS.createDownloadResumable(SPEECH_URL, SPEECH_PATH, {}, (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        onProgress(Math.min(0.99, Math.max(0.02, p.totalBytesWritten / p.totalBytesExpectedToWrite)));
      }
    });
    try {
      const result = await resumable.downloadAsync();
      if (!result) throw new Error("Download did not complete");
      onProgress(1);
    } catch (e) {
      await FS.deleteAsync(SPEECH_PATH, { idempotent: true }).catch(() => {});
      throw e;
    }
  },
  async remove(): Promise<void> {
    if (Platform.OS === "web") return;
    await FS.deleteAsync(SPEECH_PATH, { idempotent: true }).catch(() => {});
  },
};

import { Paths } from "expo-file-system";
import { apiRequest } from "@/src/services/api";
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
}

export interface ModelService {
  readonly isSimulated: boolean;
  catalogue(): ModelInfo[];
  loadState(): Promise<{ installed: string[]; selected: string | null }>;
  saveState(s: { installed: string[]; selected: string | null }): Promise<void>;
  download(id: string, onProgress: (p: number) => void): Promise<void>;
  delete(id: string): Promise<void>;
  availableBytes(): number | null;
}

const MB = 1024 ** 2;
const GB = 1024 ** 3;

const CATALOGUE: ModelInfo[] = [
  {
    id: "smollm2-135m",
    family: "SmolLM",
    name: "SmolLM2 135M Instruct",
    params: "135M",
    sizeBytes: 100 * MB,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN"],
    compatibility: { level: "likely", note: "Smallest footprint · Instant offline responses" },
    hue: "accent"
  },
  {
    id: "qwen2.5-0.5b",
    family: "Qwen",
    name: "Qwen 2.5 0.5B Instruct",
    params: "0.5B",
    sizeBytes: 468 * MB,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "ZH", "+27"],
    compatibility: { level: "likely", note: "High precision · Fits 2 GB RAM" },
    hue: "success"
  },
  {
    id: "tinyllama-1.1b",
    family: "TinyLlama",
    name: "TinyLlama 1.1B Chat",
    params: "1.1B",
    sizeBytes: 638 * MB,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN"],
    compatibility: { level: "likely", note: "Fast chat engine · Fits 3 GB RAM" },
    hue: "brand"
  },
  {
    id: "qwen2.5-1.5b",
    family: "Qwen",
    name: "Qwen 2.5 1.5B Instruct",
    params: "1.5B",
    sizeBytes: 1.1 * GB,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "ZH", "+27"],
    compatibility: { level: "likely", note: "Balanced reasoning · Fits 4 GB RAM" },
    hue: "success"
  },
  {
    id: "llama3.2-1b",
    family: "Llama",
    name: "Llama 3.2 1B Instruct",
    params: "1B",
    sizeBytes: 770 * MB,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "DE", "FR", "HI", "+4"],
    compatibility: { level: "likely", note: "Meta's compact model · Fast replies" },
    hue: "brand"
  },
  {
    id: "llama3.2-3b",
    family: "Llama",
    name: "Llama 3.2 3B Instruct",
    params: "3B",
    sizeBytes: 2.0 * GB,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "DE", "FR", "HI", "+4"],
    compatibility: { level: "likely", note: "Needs ~4 GB free RAM · Deep reasoning" },
    hue: "brand"
  },
  {
    id: "phi3.5-mini",
    family: "Phi",
    name: "Phi-3.5 Mini Instruct",
    params: "3.8B",
    sizeBytes: 2.2 * GB,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "+20"],
    compatibility: { level: "unverified", note: "High reasoning capacity · Needs 4-6 GB RAM" },
    hue: "warning"
  },
  {
    id: "qwen2.5-7b",
    family: "Qwen",
    name: "Qwen 2.5 7B Instruct",
    params: "7B",
    sizeBytes: 4.4 * GB,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN", "ZH", "+27"],
    compatibility: { level: "unlikely", note: "Needs ~8 GB RAM; high end devices only" },
    hue: "error"
  },
  {
    id: "gemma3-1b",
    family: "Gemma",
    name: "Gemma 3 1B IT",
    params: "1B",
    sizeBytes: 0.8 * GB,
    format: "GGUF",
    quantization: "Q4_K_M",
    languages: ["EN"],
    compatibility: { level: "likely", note: "Smallest footprint · fastest replies" },
    hue: "accent"
  },
];

const KEY = "ova_models_v1";

class ConnectedModelService implements ModelService {
  readonly isSimulated = false;

  catalogue(): ModelInfo[] {
    return CATALOGUE;
  }

  async loadState(): Promise<{ installed: string[]; selected: string | null }> {
    try {
      const res = await apiRequest<{ installed: string[]; selected: string | null }>("api/models/state");
      if (res.data) {
        await storage.setItem(KEY, JSON.stringify(res.data));
        return res.data;
      }
    } catch {}

    const raw = await storage.getItem(KEY, "");
    try {
      if (raw) {
        if (typeof raw === "object") return raw as any;
        return JSON.parse(String(raw));
      }
      return { installed: [], selected: null };
    } catch {
      return { installed: [], selected: null };
    }
  }

  async saveState(s: { installed: string[]; selected: string | null }): Promise<void> {
    await storage.setItem(KEY, JSON.stringify(s));
    if (s.selected) {
      apiRequest(`api/models/select/${s.selected}`, { method: "POST" }).catch(() => {});
    }
  }

  async download(id: string, onProgress: (p: number) => void): Promise<void> {
    const model = CATALOGUE.find((m) => m.id === id);
    if (model?.compatibility.level === "unlikely") {
      throw new Error("Blocked: estimated memory need exceeds this device class");
    }

    // Start download request on backend
    onProgress(0.02);
    let done = false;

    // Poll actual download progress from backend
    const pollTimer = setInterval(async () => {
      if (done) return;
      try {
        const progRes = await apiRequest<{ progress: number; status: string }>(`api/models/progress/${id}`);
        if (progRes.data && progRes.data.progress !== undefined) {
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
      if (res.error) {
        throw new Error(res.error);
      }
      onProgress(1.0);
    } finally {
      done = true;
      clearInterval(pollTimer);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await apiRequest(`api/models/${id}`, { method: "DELETE" });
    } catch {}
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

export const modelService: ModelService = new ConnectedModelService();

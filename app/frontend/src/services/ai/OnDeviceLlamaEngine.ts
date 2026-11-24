import { LlamaRN, missingNativeReason, type LlamaChatMessage, type LlamaContext } from "@/src/services/native";

import type { AIEngine, AIRequest, AIResult } from "./AIEngine.interface";

let FS: any;
try {
  FS = require("expo-file-system/legacy");
} catch {
  FS = null;
}

const SYSTEM_PROMPT =
  "You are a concise, helpful on-device AI voice assistant running fully offline. " +
  "Give clear, direct answers without unnecessary fluff.";

const STOP_TOKENS = ["</s>", "<|im_end|>", "<|eot_id|>", "<|end|>"];
const COMPLETION_TIMEOUT_MS = 25000; // 25s timeout for on-device generation

/** On-device LLM powered by llama.rn (llama.cpp). Loads the user's selected GGUF model. */
class OnDeviceLlamaEngine implements AIEngine {
  readonly id = "llama_rn";
  readonly isSimulated = false;

  private ctx: LlamaContext | null = null;
  private modelPath: string | null = null;
  private modelName = "On-device model";
  private loading: Promise<boolean> | null = null;
  private unloading: Promise<void> | null = null;
  private loadError: string | null = null;
  private isGenerating = false;

  get name(): string {
    return this.modelName;
  }

  /** Native module present in this build. */
  available(): boolean {
    return LlamaRN !== null;
  }

  /** Point the engine at a downloaded GGUF file. Serializes and unloads any previously loaded model. */
  async setModel(path: string | null, name?: string): Promise<void> {
    if (name) this.modelName = name;
    if (path === this.modelPath) return;
    await this.unload();
    this.modelPath = path;
    this.loadError = null;
  }

  /** Why the on-device model can't answer right now, or null if it can (or may). */
  unavailableReason(): string | null {
    if (!this.modelPath) return "No model selected. Download a model in the Models tab.";
    const missing = missingNativeReason("llama");
    if (missing) return missing;
    if (this.loadError) return `Couldn't load ${this.modelName}: ${this.loadError}. Try re-downloading it or picking a smaller model.`;
    return null;
  }

  isReady(): boolean {
    return this.ctx !== null;
  }

  async ensureReady(contextLength?: number): Promise<boolean> {
    // Await any pending unload operation to serialize lifecycle and prevent llama.cpp race conditions
    if (this.unloading) {
      await this.unloading;
    }
    if (this.ctx) return true;
    if (!LlamaRN || !this.modelPath) return false;
    if (this.loading) return this.loading;

    const path = this.modelPath;
    const nCtx = contextLength ?? 2048;
    this.loading = (async () => {
      try {
        if (this.unloading) {
          await this.unloading;
        }

        // Verify file genuinely exists on disk before invoking native C++
        if (FS) {
          try {
            const info = await FS.getInfoAsync(path);
            if (!info.exists || (info.size ?? 0) < 1024 * 1024) {
              console.warn("[llama] Model file does not exist on disk:", path);
              this.loadError = "Model file does not exist on device disk. Download it in Models tab.";
              this.ctx = null;
              return false;
            }
          } catch {
            /* ignore FS check error */
          }
        }

        const cleanPath = path.startsWith("file://") ? path.slice(7) : path;

        // Wrap initLlama with explicit CPU offload to avoid Qualcomm FastRPC/HTP permission crashes on Android
        const initPromise = LlamaRN.initLlama({
          model: cleanPath,
          n_ctx: nCtx,
          n_gpu_layers: 0,
          no_gpu_devices: true,
          devices: ["CPU"],
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Llama model initialization timed out after 60s")), 60000)
        );

        this.ctx = await Promise.race([initPromise, timeoutPromise]);
        this.loadError = null;
        return true;
      } catch (e: any) {
        console.warn("[llama] initLlama failed", e);
        this.loadError = e?.message || "unknown initialization error";
        this.ctx = null;
        return false;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  async generate(req: AIRequest, onToken?: (token: string) => void): Promise<AIResult> {
    if (this.isGenerating) {
      await this.stop();
    }
    this.isGenerating = true;

    try {
      const ok = await this.ensureReady();
      if (!ok || !this.ctx) {
        this.isGenerating = false;
        return { text: "" };
      }

      const messages: LlamaChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
      for (const m of req.history.slice(-6)) {
        messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
      }
      messages.push({ role: "user", content: req.text });

      // Run completion with strict timeout guarantee
      const completionPromise = this.ctx.completion(
        { messages, n_predict: 256, temperature: req.temperature ?? 0.7, stop: STOP_TOKENS },
        onToken ? (d) => onToken(d.token) : undefined
      );

      const timeoutPromise = new Promise<{ text: string }>((_, reject) =>
        setTimeout(() => reject(new Error("LLM generation timeout exceeded (25s)")), COMPLETION_TIMEOUT_MS)
      );

      const res = await Promise.race([completionPromise, timeoutPromise]);
      return { text: (res.text || "").trim() };
    } catch (e) {
      console.warn("[llama] completion error or timeout:", e);
      return { text: "" };
    } finally {
      this.isGenerating = false;
    }
  }

  async stop(): Promise<void> {
    this.isGenerating = false;
    if (this.ctx?.stopCompletion) {
      try {
        await this.ctx.stopCompletion();
      } catch {
        /* ignore */
      }
    }
  }

  async unload(): Promise<void> {
    this.isGenerating = false;
    if (this.unloading) return this.unloading;

    const c = this.ctx;
    this.ctx = null;
    if (c) {
      this.unloading = (async () => {
        try {
          await c.release();
        } catch {
          /* ignore */
        } finally {
          this.unloading = null;
        }
      })();
      return this.unloading;
    }
  }
}

export const onDeviceLlama = new OnDeviceLlamaEngine();

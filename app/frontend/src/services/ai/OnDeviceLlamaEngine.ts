import { LlamaRN, missingNativeReason, type LlamaChatMessage, type LlamaContext } from "@/src/services/native";

import type { AIEngine, AIRequest, AIResult } from "./AIEngine.interface";

const SYSTEM_PROMPT =
  "You are a concise, helpful on-device AI voice assistant running fully offline. " +
  "Give clear, direct answers without unnecessary fluff.";

const STOP_TOKENS = ["</s>", "<|im_end|>", "<|eot_id|>", "<|end|>"];

/** On-device LLM powered by llama.rn (llama.cpp). Loads the user's selected GGUF model. */
class OnDeviceLlamaEngine implements AIEngine {
  readonly id = "llama_rn";
  readonly isSimulated = false;

  private ctx: LlamaContext | null = null;
  private modelPath: string | null = null;
  private modelName = "On-device model";
  private loading: Promise<boolean> | null = null;
  private loadError: string | null = null;

  get name(): string {
    return this.modelName;
  }

  /** Native module present in this build. */
  available(): boolean {
    return LlamaRN !== null;
  }

  /** Point the engine at a downloaded GGUF file. Unloads any previously loaded model. */
  setModel(path: string | null, name?: string): void {
    if (name) this.modelName = name;
    if (path === this.modelPath) return;
    void this.unload();
    this.modelPath = path;
    this.loadError = null;
  }

  /** Why the on-device model can't answer right now, or null if it can (or may). */
  unavailableReason(): string | null {
    if (!this.modelPath) return null; // no model selected: the generic "download a model" hint applies
    const missing = missingNativeReason("llama");
    if (missing) return missing;
    if (this.loadError) return `Couldn't load ${this.modelName}: ${this.loadError}. Try re-downloading it or picking a smaller model.`;
    return null;
  }

  isReady(): boolean {
    return this.ctx !== null;
  }

  async ensureReady(): Promise<boolean> {
    if (this.ctx) return true;
    if (!LlamaRN || !this.modelPath) return false;
    if (this.loading) return this.loading;

    const path = this.modelPath;
    this.loading = (async () => {
      try {
        this.ctx = await LlamaRN.initLlama({ model: path, n_ctx: 2048, n_gpu_layers: 0 });
        this.loadError = null;
        return true;
      } catch (e: any) {
        console.warn("[llama] initLlama failed", e);
        this.loadError = e?.message || "unknown error";
        this.ctx = null;
        return false;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  async generate(req: AIRequest, onToken?: (token: string) => void): Promise<AIResult> {
    const ok = await this.ensureReady();
    if (!ok || !this.ctx) return { text: "" };

    const messages: LlamaChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const m of req.history.slice(-6)) {
      messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
    }
    messages.push({ role: "user", content: req.text });

    try {
      const res = await this.ctx.completion(
        { messages, n_predict: 256, temperature: req.temperature ?? 0.7, stop: STOP_TOKENS },
        onToken ? (d) => onToken(d.token) : undefined
      );
      return { text: (res.text || "").trim() };
    } catch (e) {
      console.warn("[llama] completion failed", e);
      return { text: "" };
    }
  }

  async stop(): Promise<void> {
    if (this.ctx?.stopCompletion) {
      try {
        await this.ctx.stopCompletion();
      } catch {
        /* ignore */
      }
    }
  }

  async unload(): Promise<void> {
    const c = this.ctx;
    this.ctx = null;
    if (c) {
      try {
        await c.release();
      } catch {
        /* ignore */
      }
    }
  }
}

export const onDeviceLlama = new OnDeviceLlamaEngine();

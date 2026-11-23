import { Buffer } from "buffer";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { NativeModules, TurboModuleRegistry } from "react-native";

if (typeof (globalThis as any).Buffer === "undefined") {
  (globalThis as any).Buffer = Buffer;
}

/**
 * Native inference bridge.
 *
 * llama.rn (on-device LLM) and whisper.rn (on-device STT) are native modules that only
 * exist in a custom dev/EAS build — not in Expo Go or on web. We load them defensively via
 * require() so the JS bundle still runs everywhere; when a module is missing the app falls
 * back gracefully (optional companion backend, or the on-device rule engine).
 */

// ---- llama.rn surface (only the parts we use) ----
export interface LlamaCompletionResult {
  text: string;
}

export interface LlamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlamaContext {
  completion(
    params: {
      messages?: LlamaChatMessage[];
      prompt?: string;
      n_predict?: number;
      temperature?: number;
      stop?: string[];
    },
    onToken?: (data: { token: string }) => void
  ): Promise<LlamaCompletionResult>;
  stopCompletion?(): Promise<void>;
  release(): Promise<void>;
}

export interface LlamaModule {
  initLlama(params: {
    model: string;
    n_ctx?: number;
    n_gpu_layers?: number;
    n_threads?: number;
  }): Promise<LlamaContext>;
}

// ---- whisper.rn surface (only the parts we use; whisper.rn >= 0.7) ----
export interface WhisperTranscribeResult {
  result: string;
  isAborted?: boolean;
  segments?: { text: string }[];
}

export interface WhisperTranscribeOptions {
  language?: string;
  maxThreads?: number;
  translate?: boolean;
}

export interface WhisperContext {
  transcribe(
    path: string,
    options?: WhisperTranscribeOptions
  ): { stop: () => Promise<void>; promise: Promise<WhisperTranscribeResult> };
  /** Raw 16 kHz mono PCM16 audio (ArrayBuffer or base64). */
  transcribeData(
    data: string | ArrayBuffer,
    options?: WhisperTranscribeOptions
  ): { stop: () => Promise<void>; promise: Promise<WhisperTranscribeResult> };
  release(): Promise<void>;
}

export interface WhisperModule {
  initWhisper(params: { filePath: string }): Promise<WhisperContext>;
}

// ---- @fugood/react-native-audio-pcm-stream (raw mic PCM for Whisper) ----
export interface LiveAudioStreamModule {
  init(options: {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    bufferSize?: number;
    wavFile: string;
  }): void;
  start(): void;
  stop(): Promise<string>;
  on(event: "data", cb: (base64Chunk: string) => void): void;
}


/**
 * Is a native module linked into this binary?
 *
 * llama.rn and whisper.rn are TurboModules. On the New Architecture (RN 0.76+, the only
 * architecture in RN 0.82+) TurboModules are NOT exposed on `NativeModules`, so checking
 * `NativeModules.RNLlama` always reports "missing" even in a correct dev build. Ask the
 * TurboModule registry first, then fall back to the legacy bridge for old-arch builds.
 */
function hasNativeModule(name: string): boolean {
  try {
    if (TurboModuleRegistry.get(name)) return true;
  } catch {
    /* registry lookup can throw for unknown modules on some RN versions */
  }
  try {
    return !!(NativeModules as Record<string, unknown>)[name];
  } catch {
    return false;
  }
}

/** True when running inside the Expo Go store client (no custom native code). */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Metro only bundles require() with *literal* module names, so each is required directly.
function loadLlama(): LlamaModule | null {
  try {
    if (!hasNativeModule("RNLlama")) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("llama.rn") as LlamaModule;
  } catch {
    return null;
  }
}

function loadWhisper(): WhisperModule | null {
  try {
    if (!hasNativeModule("RNWhisper")) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("whisper.rn");
    return (mod?.default ?? mod) as WhisperModule;
  } catch {
    return null;
  }
}

function loadLiveAudio(): LiveAudioStreamModule | null {
  try {
    if (!hasNativeModule("RNLiveAudioStream")) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@fugood/react-native-audio-pcm-stream");
    return (mod?.default ?? mod) as LiveAudioStreamModule;
  } catch {
    return null;
  }
}

export const LlamaRN: LlamaModule | null = loadLlama();
export const WhisperRN: WhisperModule | null = loadWhisper();
export const LiveAudioStream: LiveAudioStreamModule | null = loadLiveAudio();

/** Human-readable reason a native module is missing (null when it's present). */
export function missingNativeReason(what: "llama" | "whisper"): string | null {
  const present = what === "llama" ? LlamaRN !== null : WhisperRN !== null;
  if (present) return null;
  if (isExpoGo) {
    return "You're running in Expo Go, which can't load on-device AI. Install the development build (eas build --profile development) and open the app from it.";
  }
  return what === "llama"
    ? "The llama.rn native module isn't in this build. Rebuild the app (eas build --profile development, or npx expo run:android)."
    : "The whisper.rn native module isn't in this build. Rebuild the app (eas build --profile development, or npx expo run:android).";
}

export const nativeInference = {
  get llamaAvailable(): boolean {
    return LlamaRN !== null;
  },
  get whisperAvailable(): boolean {
    return WhisperRN !== null;
  },
};

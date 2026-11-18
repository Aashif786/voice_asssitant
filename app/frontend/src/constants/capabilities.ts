import type { CapabilityMode, ImplementationStatus } from "@/src/types";

export interface Capability {
  key: string;
  label: string;
  mode: CapabilityMode;
  status: ImplementationStatus;
  detail: string;
}

export const CAPABILITIES: Capability[] = [
  { key: "tts", label: "Speech synthesis", mode: "OFFLINE", status: "implemented", detail: "Native on-device text-to-speech at an adjustable rate." },
  { key: "llm", label: "Local LLM", mode: "OFFLINE", status: "implemented", detail: "On-device reasoning via llama.cpp (llama.rn). Download a model in the Models tab; runs in a development build." },
  { key: "stt", label: "Speech recognition", mode: "OFFLINE", status: "implemented", detail: "On-device Whisper (whisper.rn). Needs a development build and a one-time speech-model download." },
  { key: "wake", label: "Wake-word detection", mode: "OFFLINE", status: "planned", detail: "Awaiting a native wake-word engine and an Android foreground service." },
  { key: "calendar", label: "Calendar", mode: "OFFLINE", status: "implemented", detail: "Reads and manages agenda events and schedule." },
  { key: "messaging", label: "Messaging", mode: "OFFLINE", status: "implemented", detail: "Drafts locally and prepares WhatsApp/SMS links after confirmation." },
  { key: "files", label: "Files", mode: "OFFLINE", status: "implemented", detail: "Workspace and file search." },
  { key: "search", label: "Web search", mode: "ONLINE", status: "implemented", detail: "Live search via DuckDuckGo and Wikipedia, with confirmation." },
];

export const APP_VERSION = "1.0.0";

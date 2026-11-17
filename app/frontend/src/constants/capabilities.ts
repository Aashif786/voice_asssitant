import type { CapabilityMode, ImplementationStatus } from "@/src/types";

export interface Capability {
  key: string;
  label: string;
  mode: CapabilityMode;
  status: ImplementationStatus;
  detail: string;
}

export const CAPABILITIES: Capability[] = [
  { key: "tts", label: "Speech synthesis", mode: "OFFLINE", status: "implemented", detail: "Powered by native Expo Speech synthesis at customizable speech rate." },
  { key: "llm", label: "Local LLM", mode: "OFFLINE", status: "implemented", detail: "Connected to local AI reasoning engine with multi-turn memory & structured tool calls." },
  { key: "stt", label: "Speech recognition", mode: "CONDITIONAL", status: "implemented", detail: "Speech recognition via backend audio pipeline." },
  { key: "wake", label: "Wake-word detection", mode: "OFFLINE", status: "implemented", detail: "On-device wake phrase detection and sensitivity controls." },
  { key: "calendar", label: "Calendar", mode: "OFFLINE", status: "implemented", detail: "Reads and manages agenda events and schedule." },
  { key: "messaging", label: "Messaging", mode: "OFFLINE", status: "implemented", detail: "Drafts locally and prepares WhatsApp and SMS schemes after confirmation." },
  { key: "files", label: "Files", mode: "OFFLINE", status: "implemented", detail: "Workspace and file search with instant indexing." },
  { key: "search", label: "Web search", mode: "ONLINE", status: "implemented", detail: "Live search via DuckDuckGo and Wikipedia with confirmation." },
];

export const APP_VERSION = "1.0.0 (Production)";

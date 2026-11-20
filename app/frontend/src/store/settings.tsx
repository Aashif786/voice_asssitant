import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { conversationRepository } from "@/src/services/storage/SQLiteService";
import { setColorScheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export interface Settings {
  name: string;
  theme: "system" | "dark" | "light";
  handsFreeEnabled: boolean;
  wakePhrase: string;
  wakeSensitivity: "low" | "medium" | "high";
  language: string;
  voice: string;
  speechRate: number;
  autoPlayback: boolean;
  audioRetention: "never" | "session";
  conversationRetention: "forever" | "30d" | "7d";
  temperature: number;
  contextLength: number;
  callMode: "dialer" | "direct";
  ownerOnlyMode: boolean;
  voiceEnrolled: boolean;
  voiceVerificationThreshold: number;
  antiSpoofingEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  name: "",
  theme: "dark",
  handsFreeEnabled: false,
  wakePhrase: "Hey Assistant",
  wakeSensitivity: "medium",
  language: "English (US)",
  voice: "Aria · neutral",
  speechRate: 1,
  autoPlayback: true,
  audioRetention: "never",
  conversationRetention: "forever",
  temperature: 0.7,
  contextLength: 2048,
  callMode: "dialer",
  ownerOnlyMode: true,
  voiceEnrolled: false,
  voiceVerificationThreshold: 0.75,
  antiSpoofingEnabled: true,
};

const KEY = "ova_settings_v1";
const DAYS: Record<Settings["conversationRetention"], number | null> = { forever: null, "30d": 30, "7d": 7 };

type Ctx = { settings: Settings; ready: boolean; update: (p: Partial<Settings>) => void };
const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem(KEY, "");
      let s = DEFAULT_SETTINGS;
      try {
        if (raw) {
          if (typeof raw === "object") {
            s = { ...DEFAULT_SETTINGS, ...(raw as any) };
          } else {
            s = { ...DEFAULT_SETTINGS, ...JSON.parse(String(raw)) };
          }
        }
      } catch {}
      setSettings(s);
      setColorScheme(s.theme === "system" ? null : s.theme);
      const days = DAYS[s.conversationRetention];
      if (days) await conversationRepository.purgeOlderThan(Date.now() - days * 86400000).catch(() => {});
      setReady(true);
    })();
  }, []);

  const update = useCallback((p: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...p };
      storage.setItem(KEY, JSON.stringify(next));
      if (p.theme) setColorScheme(p.theme === "system" ? null : p.theme);
      return next;
    });
  }, []);

  return <SettingsContext.Provider value={{ settings, ready, update }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const c = useContext(SettingsContext);
  if (!c) throw new Error("useSettings must be inside SettingsProvider");
  return c;
}

import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";
import { newId } from "@/src/utils/format";
import { storage } from "@/src/utils/storage";

export interface PersonalRoutine {
  id: string;
  title: string;
  triggerType: "time" | "morning" | "evening";
  timeSpec: string;
  days: string;
  actions: string[];
  enabled: boolean;
  createdAt: number;
}

const WEB_KEY = "ova_routines_v1";

const DEFAULT_ROUTINES: PersonalRoutine[] = [
  {
    id: "routine_morning",
    title: "Morning Briefing",
    triggerType: "morning",
    timeSpec: "08:00 AM",
    days: "Weekdays",
    actions: ["daily_briefing"],
    enabled: true,
    createdAt: Date.now(),
  },
  {
    id: "routine_evening",
    title: "Evening Wind-Down",
    triggerType: "evening",
    timeSpec: "09:30 PM",
    days: "Daily",
    actions: ["check_battery"],
    enabled: true,
    createdAt: Date.now(),
  },
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
function getDb() {
  if (Platform.OS === "web") return null;
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync("assistant.db");
      await d.execAsync(`
        CREATE TABLE IF NOT EXISTS personal_routines (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          trigger_type TEXT NOT NULL,
          time_spec TEXT NOT NULL,
          days TEXT NOT NULL,
          actions TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL
        );
      `);
      return d;
    })();
  }
  return dbPromise;
}

type RoutineRow = {
  id: string;
  title: string;
  trigger_type: string;
  time_spec: string;
  days: string;
  actions: string;
  enabled: number;
  created_at: number;
};

const toRoutine = (r: RoutineRow): PersonalRoutine => ({
  id: r.id,
  title: r.title,
  triggerType: r.trigger_type as PersonalRoutine["triggerType"],
  timeSpec: r.time_spec,
  days: r.days,
  actions: JSON.parse(r.actions || "[]"),
  enabled: r.enabled === 1,
  createdAt: r.created_at,
});

export const RoutineRepository = {
  async listRoutines(): Promise<PersonalRoutine[]> {
    if (Platform.OS === "web") {
      const raw = await storage.getItem(WEB_KEY, "");
      if (!raw) {
        await storage.setItem(WEB_KEY, JSON.stringify(DEFAULT_ROUTINES));
        return DEFAULT_ROUTINES;
      }
      return JSON.parse(String(raw)) as PersonalRoutine[];
    }

    const d = await getDb()!;
    const rows = await d.getAllAsync<RoutineRow>("SELECT * FROM personal_routines ORDER BY created_at ASC");
    if (rows.length === 0) {
      // Seed defaults
      for (const def of DEFAULT_ROUTINES) {
        await d.runAsync(
          `INSERT INTO personal_routines (id, title, trigger_type, time_spec, days, actions, enabled, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          def.id,
          def.title,
          def.triggerType,
          def.timeSpec,
          def.days,
          JSON.stringify(def.actions),
          def.enabled ? 1 : 0,
          def.createdAt
        );
      }
      return DEFAULT_ROUTINES;
    }
    return rows.map(toRoutine);
  },

  async toggleRoutine(id: string, enabled: boolean): Promise<void> {
    if (Platform.OS === "web") {
      const list = await this.listRoutines();
      const next = list.map((r) => (r.id === id ? { ...r, enabled } : r));
      await storage.setItem(WEB_KEY, JSON.stringify(next));
      return;
    }
    const d = await getDb()!;
    await d.runAsync("UPDATE personal_routines SET enabled = ? WHERE id = ?", enabled ? 1 : 0, id);
  },

  async addRoutine(
    title: string,
    triggerType: PersonalRoutine["triggerType"],
    timeSpec: string,
    days: string,
    actions: string[]
  ): Promise<PersonalRoutine> {
    const routine: PersonalRoutine = {
      id: newId(),
      title: title.trim(),
      triggerType,
      timeSpec: timeSpec.trim(),
      days: days.trim(),
      actions,
      enabled: true,
      createdAt: Date.now(),
    };

    if (Platform.OS === "web") {
      const list = await this.listRoutines();
      list.push(routine);
      await storage.setItem(WEB_KEY, JSON.stringify(list));
      return routine;
    }

    const d = await getDb()!;
    await d.runAsync(
      `INSERT INTO personal_routines (id, title, trigger_type, time_spec, days, actions, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      routine.id,
      routine.title,
      routine.triggerType,
      routine.timeSpec,
      routine.days,
      JSON.stringify(routine.actions),
      routine.createdAt
    );
    return routine;
  },

  async deleteRoutine(id: string): Promise<void> {
    if (Platform.OS === "web") {
      const list = (await this.listRoutines()).filter((r) => r.id !== id);
      await storage.setItem(WEB_KEY, JSON.stringify(list));
      return;
    }
    const d = await getDb()!;
    await d.runAsync("DELETE FROM personal_routines WHERE id = ?", id);
  },
};

export default RoutineRepository;

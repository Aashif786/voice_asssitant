import { Platform } from "react-native";
import { newId } from "@/src/utils/format";
import { storage } from "@/src/utils/storage";
import { getDatabase } from "./database";

export interface UserMemory {
  id: string;
  category: "preference" | "fact" | "contact_alias" | "relationship";
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: "explicit_user" | "extracted";
  createdAt: number;
  updatedAt: number;
}

const WEB_KEY = "ova_user_memories_v1";

function getDb() {
  return getDatabase();
}

type MemoryRow = {
  id: string;
  category: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string;
  created_at: number;
  updated_at: number;
};

const toMemory = (r: MemoryRow): UserMemory => ({
  id: r.id,
  category: r.category as UserMemory["category"],
  subject: r.subject,
  predicate: r.predicate,
  object: r.object,
  confidence: r.confidence,
  source: r.source as UserMemory["source"],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const MemoryRepository = {
  async listMemories(category?: string): Promise<UserMemory[]> {
    if (Platform.OS === "web") {
      const raw = await storage.getItem(WEB_KEY, "[]");
      const list = JSON.parse(String(raw) || "[]") as UserMemory[];
      if (category) return list.filter((m) => m.category === category);
      return list;
    }

    const d = await getDb()!;
    if (category) {
      const rows = await d.getAllAsync<MemoryRow>(
        "SELECT * FROM user_memories WHERE category = ? ORDER BY updated_at DESC",
        category
      );
      return rows.map(toMemory);
    }
    const rows = await d.getAllAsync<MemoryRow>(
      "SELECT * FROM user_memories ORDER BY updated_at DESC"
    );
    return rows.map(toMemory);
  },

  async addMemory(
    category: UserMemory["category"],
    subject: string,
    predicate: string,
    object: string,
    source: UserMemory["source"] = "explicit_user"
  ): Promise<UserMemory> {
    const now = Date.now();
    const memory: UserMemory = {
      id: newId(),
      category,
      subject: subject.trim(),
      predicate: predicate.trim(),
      object: object.trim(),
      confidence: 1.0,
      source,
      createdAt: now,
      updatedAt: now,
    };

    if (Platform.OS === "web") {
      const list = await this.listMemories();
      list.unshift(memory);
      await storage.setItem(WEB_KEY, JSON.stringify(list));
      return memory;
    }

    const d = await getDb()!;
    await d.runAsync(
      `INSERT INTO user_memories (id, category, subject, predicate, object, confidence, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      memory.id,
      memory.category,
      memory.subject,
      memory.predicate,
      memory.object,
      memory.confidence,
      memory.source,
      now,
      now
    );
    return memory;
  },

  async deleteMemory(id: string): Promise<void> {
    if (Platform.OS === "web") {
      const list = (await this.listMemories()).filter((m) => m.id !== id);
      await storage.setItem(WEB_KEY, JSON.stringify(list));
      return;
    }
    const d = await getDb()!;
    await d.runAsync("DELETE FROM user_memories WHERE id = ?", id);
  },

  async clearAll(): Promise<void> {
    if (Platform.OS === "web") {
      await storage.setItem(WEB_KEY, "[]");
      return;
    }
    const d = await getDb()!;
    await d.execAsync("DELETE FROM user_memories;");
  },

  async searchMemories(query: string): Promise<UserMemory[]> {
    const clean = query.trim().toLowerCase();
    const all = await this.listMemories();
    return all.filter(
      (m) =>
        m.subject.toLowerCase().includes(clean) ||
        m.predicate.toLowerCase().includes(clean) ||
        m.object.toLowerCase().includes(clean)
    );
  },
};

export default MemoryRepository;

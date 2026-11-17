// Web preview fallback: same repository contract, backed by local key-value storage.
import type { Conversation, Message } from "@/src/types";
import { newId } from "@/src/utils/format";
import { storage } from "@/src/utils/storage";

import type { ConversationRepository } from "./ConversationRepository.interface";

const KEY = "ova_db_v1";
type DB = { conversations: Conversation[]; messages: Message[] };

async function read(): Promise<DB> {
  const raw = await storage.getItem(KEY, "");
  if (!raw) return { conversations: [], messages: [] };
  try { return JSON.parse(String(raw)) as DB; } catch { return { conversations: [], messages: [] }; }
}
const write = (d: DB) => storage.setItem(KEY, JSON.stringify(d));

export const conversationRepository: ConversationRepository = {
  backend: "web-kv",
  async listConversations() {
    const d = await read();
    return d.conversations.filter((c) => c.lastMessage).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async getConversation(id) {
    return (await read()).conversations.find((c) => c.id === id) ?? null;
  },
  async createConversation(title) {
    const d = await read();
    const now = Date.now();
    const c: Conversation = { id: newId(), title, createdAt: now, updatedAt: now, lastMessage: "" };
    d.conversations.push(c);
    await write(d);
    return c;
  },
  async getMessages(id) {
    return (await read()).messages.filter((m) => m.conversationId === id).sort((a, b) => a.createdAt - b.createdAt);
  },
  async addMessage(m) {
    const d = await read();
    d.messages.push(m);
    d.conversations = d.conversations.map((c) => (c.id === m.conversationId ? { ...c, updatedAt: m.createdAt, lastMessage: m.content.slice(0, 160) } : c));
    await write(d);
  },
  async updateMessageTool(id, tool) {
    const d = await read();
    d.messages = d.messages.map((m) => (m.id === id ? { ...m, tool } : m));
    await write(d);
  },
  async deleteConversation(id) {
    const d = await read();
    await write({ conversations: d.conversations.filter((c) => c.id !== id), messages: d.messages.filter((m) => m.conversationId !== id) });
  },
  async clearAll() {
    await write({ conversations: [], messages: [] });
  },
  async purgeOlderThan(ts) {
    const d = await read();
    const keep = new Set(d.conversations.filter((c) => c.updatedAt >= ts).map((c) => c.id));
    await write({ conversations: d.conversations.filter((c) => keep.has(c.id)), messages: d.messages.filter((m) => keep.has(m.conversationId)) });
  },
};

void newId;

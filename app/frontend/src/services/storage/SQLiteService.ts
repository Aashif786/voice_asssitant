import type { Conversation, Message, ToolCall } from "@/src/types";
import { newId } from "@/src/utils/format";

import type { ConversationRepository } from "./ConversationRepository.interface";
import { getDatabase } from "./database";

export { getDatabase };

async function db() {
  const d = await getDatabase();
  if (!d) throw new Error("SQLite database unavailable in this environment");
  return d;
}

type ConvRow = { id: string; title: string; created_at: number; updated_at: number; last_message: string };
type MsgRow = { id: string; conversation_id: string; role: string; content: string; created_at: number; tool: string | null };

const toConv = (r: ConvRow): Conversation => ({ id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at, lastMessage: r.last_message });
const toMsg = (r: MsgRow): Message => ({
  id: r.id, conversationId: r.conversation_id, role: r.role as Message["role"], content: r.content, createdAt: r.created_at,
  tool: r.tool ? (JSON.parse(r.tool) as ToolCall) : null,
});

export const conversationRepository: ConversationRepository = {
  backend: "sqlite",
  async listConversations() {
    const rows = await (await db()).getAllAsync<ConvRow>("SELECT * FROM conversations WHERE last_message != '' ORDER BY updated_at DESC");
    return rows.map(toConv);
  },
  async getConversation(id) {
    const r = await (await db()).getFirstAsync<ConvRow>("SELECT * FROM conversations WHERE id = ?", id);
    return r ? toConv(r) : null;
  },
  async createConversation(title) {
    const now = Date.now();
    const c: Conversation = { id: newId(), title, createdAt: now, updatedAt: now, lastMessage: "" };
    await (await db()).runAsync("INSERT INTO conversations (id, title, created_at, updated_at, last_message) VALUES (?, ?, ?, ?, '')", c.id, c.title, now, now);
    return c;
  },
  async getMessages(conversationId) {
    const rows = await (await db()).getAllAsync<MsgRow>("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC", conversationId);
    return rows.map(toMsg);
  },
  async addMessage(m) {
    const d = await db();
    await d.withTransactionAsync(async () => {
      await d.runAsync("INSERT INTO messages (id, conversation_id, role, content, created_at, tool) VALUES (?, ?, ?, ?, ?, ?)",
        m.id, m.conversationId, m.role, m.content, m.createdAt, m.tool ? JSON.stringify(m.tool) : null);
      await d.runAsync("UPDATE conversations SET updated_at = ?, last_message = ? WHERE id = ?", m.createdAt, m.content.slice(0, 160), m.conversationId);
    });
  },
  async updateMessageTool(id, tool) {
    await (await db()).runAsync("UPDATE messages SET tool = ? WHERE id = ?", JSON.stringify(tool), id);
  },
  async deleteConversation(id) {
    const d = await db();
    await d.withTransactionAsync(async () => {
      await d.runAsync("DELETE FROM messages WHERE conversation_id = ?", id);
      await d.runAsync("DELETE FROM conversations WHERE id = ?", id);
    });
  },
  async clearAll() {
    await (await db()).execAsync("DELETE FROM messages; DELETE FROM conversations;");
  },
  async purgeOlderThan(ts) {
    const d = await db();
    await d.runAsync("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE updated_at < ?)", ts);
    await d.runAsync("DELETE FROM conversations WHERE updated_at < ?", ts);
  },
};

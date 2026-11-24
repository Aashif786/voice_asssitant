import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Returns a singleton shared SQLiteDatabase instance initialized with WAL mode
 * and all core application schemas (conversations, messages, user_memories, personal_routines).
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> | null {
  if (Platform.OS === "web") return null;

  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync("assistant.db");
      await d.execAsync(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_message TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY NOT NULL,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          tool TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id, created_at);

        CREATE TABLE IF NOT EXISTS user_memories (
          id TEXT PRIMARY KEY NOT NULL,
          category TEXT NOT NULL,
          subject TEXT NOT NULL,
          predicate TEXT NOT NULL,
          object TEXT NOT NULL,
          confidence REAL NOT NULL DEFAULT 1.0,
          source TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_memories_cat ON user_memories(category, subject);

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

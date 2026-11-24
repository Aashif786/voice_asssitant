import contextlib
import json
import sqlite3
import time
import uuid
from typing import Any, Dict, Generator, List, Optional
from backend.app.config import DB_PATH

@contextlib.contextmanager
def get_connection() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db() -> None:
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Reminders table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS reminders (
                id TEXT PRIMARY KEY,
                task TEXT NOT NULL,
                time_str TEXT NOT NULL,
                due_timestamp INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at INTEGER NOT NULL
            )
        """)
        
        # Calendar events table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS calendar_events (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                range_type TEXT NOT NULL DEFAULT 'today',
                location TEXT DEFAULT '',
                description TEXT DEFAULT '',
                created_at INTEGER NOT NULL
            )
        """)
        
        # Message drafts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS message_drafts (
                id TEXT PRIMARY KEY,
                recipient TEXT NOT NULL,
                body TEXT NOT NULL,
                platform TEXT NOT NULL DEFAULT 'whatsapp',
                created_at INTEGER NOT NULL
            )
        """)
        
        # Model registry table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS model_registry (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'installed',
                downloaded_at INTEGER NOT NULL
            )
        """)

        # Personal memories table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                fact TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)

        # Custom models registry table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS custom_models (
                id TEXT PRIMARY KEY,
                data_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)
        
        # App settings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        # Seed sample calendar events if none exist
        cursor.execute("SELECT COUNT(*) AS count FROM calendar_events")
        if cursor.fetchone()["count"] == 0:
            now = int(time.time() * 1000)
            cursor.execute("""
                INSERT INTO calendar_events (id, title, start_time, end_time, range_type, location, description, created_at)
                VALUES 
                (?, 'Design Sync with Mobile Team', '10:00 AM', '11:00 AM', 'today', 'Room 3B', 'Discussing offline voice pipeline', ?),
                (?, 'Weekly Sprint Review', '02:30 PM', '03:30 PM', 'today', 'Online', 'Demo voice assistant capabilities', ?),
                (?, 'AI Model Evaluation & Benchmark', '11:00 AM', '12:30 PM', 'tomorrow', 'Lab 2', 'Testing Qwen and Llama quantizations', ?)
            """, (str(uuid.uuid4()), now, str(uuid.uuid4()), now, str(uuid.uuid4()), now))

        # Seed sample reminder if none exist
        cursor.execute("SELECT COUNT(*) AS count FROM reminders")
        if cursor.fetchone()["count"] == 0:
            now = int(time.time() * 1000)
            cursor.execute("""
                INSERT INTO reminders (id, task, time_str, due_timestamp, status, created_at)
                VALUES (?, 'Review voice assistant diagnostics report', 'Tonight at 7:00 PM', ?, 'active', ?)
            """, (str(uuid.uuid4()), now + 3600 * 4 * 1000, now))

        conn.commit()

# Reminders helpers
def create_reminder(task: str, time_str: str, due_timestamp: Optional[int] = None) -> Dict[str, Any]:
    rem_id = str(uuid.uuid4())
    now = int(time.time() * 1000)
    due = due_timestamp or (now + 3600 * 1000)
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO reminders (id, task, time_str, due_timestamp, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)",
            (rem_id, task, time_str, due, now)
        )
        conn.commit()
    return {"id": rem_id, "task": task, "time_str": time_str, "due_timestamp": due, "status": "active"}

def list_reminders(status: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        if status:
            cursor = conn.execute("SELECT * FROM reminders WHERE status = ? ORDER BY due_timestamp ASC", (status,))
        else:
            cursor = conn.execute("SELECT * FROM reminders ORDER BY due_timestamp ASC")
        return [dict(row) for row in cursor.fetchall()]

# Calendar helpers
def list_calendar_events(range_type: str = "today") -> List[Dict[str, Any]]:
    with get_connection() as conn:
        if range_type.lower() in ("all", "upcoming"):
            cursor = conn.execute("SELECT * FROM calendar_events ORDER BY created_at ASC")
        else:
            cursor = conn.execute("SELECT * FROM calendar_events WHERE range_type = ? ORDER BY created_at ASC", (range_type.lower(),))
        return [dict(row) for row in cursor.fetchall()]

def add_calendar_event(title: str, start_time: str, end_time: str, range_type: str = "today", location: str = "") -> Dict[str, Any]:
    ev_id = str(uuid.uuid4())
    now = int(time.time() * 1000)
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO calendar_events (id, title, start_time, end_time, range_type, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (ev_id, title, start_time, end_time, range_type, location, now)
        )
        conn.commit()
    return {"id": ev_id, "title": title, "start_time": start_time, "end_time": end_time, "range_type": range_type}

# Draft messages helpers
def save_draft_message(recipient: str, body: str, platform: str = "whatsapp") -> Dict[str, Any]:
    draft_id = str(uuid.uuid4())
    now = int(time.time() * 1000)
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO message_drafts (id, recipient, body, platform, created_at) VALUES (?, ?, ?, ?, ?)",
            (draft_id, recipient, body, platform, now)
        )
        conn.commit()
    return {"id": draft_id, "recipient": recipient, "body": body, "platform": platform}

def list_draft_messages() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute("SELECT * FROM message_drafts ORDER BY created_at DESC")
        return [dict(row) for row in cursor.fetchall()]

# Models registry helpers
def register_model_record(model_id: str, name: str, file_path: str, size_bytes: int) -> None:
    now = int(time.time() * 1000)
    with get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO model_registry (id, name, file_path, size_bytes, status, downloaded_at) VALUES (?, ?, ?, ?, 'installed', ?)",
            (model_id, name, file_path, size_bytes, now)
        )
        conn.commit()

def delete_model_record(model_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM model_registry WHERE id = ?", (model_id,))
        conn.commit()

def get_installed_model_ids() -> List[str]:
    with get_connection() as conn:
        cursor = conn.execute("SELECT id FROM model_registry")
        return [row["id"] for row in cursor.fetchall()]

# Custom models helpers
def save_custom_model_record(model_id: str, data: Dict[str, Any]) -> None:
    now = int(time.time() * 1000)
    norm_id = model_id.lower().strip()
    with get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO custom_models (id, data_json, created_at) VALUES (?, ?, ?)",
            (norm_id, json.dumps(data), now)
        )
        conn.commit()

def load_custom_models_records() -> Dict[str, Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute("SELECT id, data_json FROM custom_models")
        result = {}
        for row in cursor.fetchall():
            try:
                result[row["id"].lower()] = json.loads(row["data_json"])
            except Exception:
                pass
        return result

def delete_custom_model_record(model_id: str) -> None:
    norm_id = model_id.lower().strip()
    with get_connection() as conn:
        conn.execute("DELETE FROM custom_models WHERE id = ?", (norm_id,))
        conn.commit()

# Personal memories helpers
def save_memory(fact: str) -> Dict[str, Any]:
    mem_id = str(uuid.uuid4())
    now = int(time.time() * 1000)
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO memories (id, fact, created_at) VALUES (?, ?, ?)",
            (mem_id, fact.strip(), now)
        )
        conn.commit()
    return {"id": mem_id, "fact": fact.strip(), "created_at": now}

def list_memories() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute("SELECT * FROM memories ORDER BY created_at DESC")
        return [dict(row) for row in cursor.fetchall()]

def delete_memory(mem_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM memories WHERE id = ?", (mem_id,))
        conn.commit()

# Ensure tables are initialized on import
init_db()

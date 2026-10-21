
"""SQLite database functions for AI Knowledge Assistant."""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path


# Store the database beside this Python file.
BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "chat_history.db"


def get_connection():
    """Create a database connection with foreign keys enabled."""
    connection = sqlite3.connect(str(DATABASE_PATH), timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database():
    """Create the conversation and message tables if missing."""

    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                conversation_id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                document_filename TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT 'New Chat',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                message_id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL
                    CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id)
                    REFERENCES conversations(conversation_id)
                    ON DELETE CASCADE
            )
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS
            idx_chat_messages_conversation
            ON chat_messages(conversation_id, message_id)
        """)


def current_timestamp():
    """Return the current UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


def row_to_dict(row):
    """Convert a SQLite row to a regular dictionary."""
    return dict(row) if row is not None else None


def create_conversation(
    conversation_id,
    document_id,
    document_filename,
    title="New Chat",
):
    """Create a conversation and return its details."""

    now = current_timestamp()
    clean_title = (title or "New Chat").strip() or "New Chat"

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO conversations (
                conversation_id,
                document_id,
                document_filename,
                title,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                conversation_id,
                document_id,
                document_filename,
                clean_title,
                now,
                now,
            ),
        )

        row = connection.execute(
            """
            SELECT *
            FROM conversations
            WHERE conversation_id = ?
            """,
            (conversation_id,),
        ).fetchone()

    return row_to_dict(row)


def list_conversations():
    """Return conversations, newest activity first."""

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                c.*,
                (
                    SELECT COUNT(*)
                    FROM chat_messages m
                    WHERE m.conversation_id = c.conversation_id
                ) AS message_count
            FROM conversations c
            ORDER BY c.updated_at DESC
            """
        ).fetchall()

    return [dict(row) for row in rows]


def get_conversation(conversation_id):
    """Return a conversation with its saved messages."""

    with get_connection() as connection:
        conversation_row = connection.execute(
            """
            SELECT *
            FROM conversations
            WHERE conversation_id = ?
            """,
            (conversation_id,),
        ).fetchone()

        if conversation_row is None:
            return None

        message_rows = connection.execute(
            """
            SELECT
                message_id,
                conversation_id,
                role,
                content,
                created_at
            FROM chat_messages
            WHERE conversation_id = ?
            ORDER BY message_id ASC
            """,
            (conversation_id,),
        ).fetchall()

    conversation = dict(conversation_row)
    conversation["messages"] = [
        dict(row) for row in message_rows
    ]

    return conversation


def add_message(conversation_id, role, content):
    """Save a message and update conversation activity.

    Returns None if the conversation does not exist.
    Returns the saved message dictionary on success.
    """

    if role not in {"user", "assistant"}:
        raise ValueError("role must be 'user' or 'assistant'")

    clean_content = (content or "").strip()

    if not clean_content:
        raise ValueError("Message content cannot be empty")

    now = current_timestamp()

    with get_connection() as connection:
        conversation = connection.execute(
            """
            SELECT conversation_id, title
            FROM conversations
            WHERE conversation_id = ?
            """,
            (conversation_id,),
        ).fetchone()

        if conversation is None:
            return None

        cursor = connection.execute(
            """
            INSERT INTO chat_messages (
                conversation_id,
                role,
                content,
                created_at
            )
            VALUES (?, ?, ?, ?)
            """,
            (
                conversation_id,
                role,
                clean_content,
                now,
            ),
        )

        connection.execute(
            """
            UPDATE conversations
            SET updated_at = ?
            WHERE conversation_id = ?
            """,
            (now, conversation_id),
        )

        # Use the first user message as the conversation title.
        if role == "user" and conversation["title"] == "New Chat":
            new_title = clean_content.replace("\n", " ")[:60]

            connection.execute(
                """
                UPDATE conversations
                SET title = ?
                WHERE conversation_id = ?
                """,
                (new_title, conversation_id),
            )

        saved_row = connection.execute(
            """
            SELECT *
            FROM chat_messages
            WHERE message_id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return row_to_dict(saved_row)


def delete_conversation(conversation_id):
    """Delete a conversation and its messages.

    Returns True when a conversation was deleted, otherwise False.
    """

    with get_connection() as connection:
        cursor = connection.execute(
            """
            DELETE FROM conversations
            WHERE conversation_id = ?
            """,
            (conversation_id,),
        )

        return cursor.rowcount > 0


# Initialize the database tables when this module is imported.
initialize_database()


if __name__ == "__main__":
    print("Database:", DATABASE_PATH)
    print("Database initialization successful.")

    print("\nSaved conversations:")
    for conversation in list_conversations():
        print(
            conversation["conversation_id"],
            conversation["title"],
            conversation["message_count"],
        )

import type Database from "better-sqlite3";

import type { Message } from "@openartifact/shared";
import { parseMessage } from "@openartifact/shared";

import type {
  ArtifactInput,
  ArtifactRecord,
  ArtifactVersionInput,
  ArtifactVersionRecord,
  ConversationRecord,
  MessageRecord,
  Repository,
  ToolCallRecord,
} from "./repository";

/**
 * The `better-sqlite3` {@link Repository} implementation (§11). It owns no
 * connection of its own — the caller passes one opened by {@link openDatabase}
 * and already migrated by {@link runMigrations} — so the engine stays swappable
 * behind the same interface.
 */

interface ConversationRow {
  id: string;
  title: string;
  created_at: number;
}

interface MessageRow {
  id: string;
  role: string;
  parts_json: string;
  created_at: number;
  seq: number;
}

interface ArtifactRow {
  id: number;
  conversation_id: string;
  identifier: string;
  title: string;
  type: string;
  language: string | null;
  created_at: number;
}

interface ArtifactVersionRow {
  id: number;
  artifact_id: number;
  version: number;
  content: string;
  incomplete: number;
  created_at: number;
}

interface ToolCallRow {
  conversation_id: string;
  call_id: string;
  seq: number;
  name: string;
  args_json: string;
  result: string | null;
  is_error: number;
  decision_json: string | null;
  created_at: number;
}

/** Parse a JSON column value; returns `fallback` on a corrupt/absent value. */
function parseJson<T>(text: string | null, fallback: T): T {
  if (text === null) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function messageFromRow(row: MessageRow): Message {
  return parseMessage({
    id: row.id,
    role: row.role,
    parts: JSON.parse(row.parts_json) as unknown,
    createdAt: row.created_at,
  });
}

function artifactFromRow(row: ArtifactRow): ArtifactRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    identifier: row.identifier,
    title: row.title,
    type: row.type,
    language: row.language,
    createdAt: row.created_at,
  };
}

function artifactVersionFromRow(row: ArtifactVersionRow): ArtifactVersionRecord {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    version: row.version,
    content: row.content,
    incomplete: row.incomplete !== 0,
    createdAt: row.created_at,
  };
}

export class SqliteRepository implements Repository {
  readonly #db: Database.Database;

  constructor(db: Database.Database) {
    this.#db = db;
  }

  saveConversation(record: ConversationRecord): void {
    this.#db
      .prepare(
        "INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET title = excluded.title, created_at = excluded.created_at",
      )
      .run(record.id, record.title, record.createdAt);
  }

  getConversation(id: string): ConversationRecord | null {
    const row = this.#db
      .prepare("SELECT id, title, created_at FROM conversations WHERE id = ?")
      .get(id) as ConversationRow | undefined;
    return row ? { id: row.id, title: row.title, createdAt: row.created_at } : null;
  }

  listConversations(): ConversationRecord[] {
    const rows = this.#db
      .prepare("SELECT id, title, created_at FROM conversations ORDER BY created_at DESC")
      .all() as ConversationRow[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
    }));
  }

  saveMessage(record: MessageRecord): void {
    this.#db
      .prepare(
        "INSERT INTO messages (conversation_id, seq, id, role, parts_json, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(conversation_id, seq) DO UPDATE SET " +
          "id = excluded.id, role = excluded.role, parts_json = excluded.parts_json, " +
          "created_at = excluded.created_at",
      )
      .run(
        record.conversationId,
        record.seq,
        record.message.id,
        record.message.role,
        JSON.stringify(record.message.parts),
        record.message.createdAt,
      );
  }

  listMessages(conversationId: string): MessageRecord[] {
    const rows = this.#db
      .prepare(
        "SELECT id, role, parts_json, created_at, seq FROM messages " +
          "WHERE conversation_id = ? ORDER BY seq",
      )
      .all(conversationId) as MessageRow[];
    return rows.map((row) => ({
      conversationId,
      seq: row.seq,
      message: messageFromRow(row),
    }));
  }

  saveArtifact(input: ArtifactInput): ArtifactRecord {
    const existing = this.getArtifact(input.conversationId, input.identifier);
    if (existing) {
      this.#db
        .prepare(
          "UPDATE artifacts SET title = ?, type = ?, language = ?, created_at = ? WHERE id = ?",
        )
        .run(input.title, input.type, input.language, input.createdAt, existing.id);
      return {
        ...existing,
        title: input.title,
        type: input.type,
        language: input.language,
        createdAt: input.createdAt,
      };
    }

    const info = this.#db
      .prepare(
        "INSERT INTO artifacts (conversation_id, identifier, title, type, language, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.conversationId,
        input.identifier,
        input.title,
        input.type,
        input.language,
        input.createdAt,
      );
    return {
      id: Number(info.lastInsertRowid),
      conversationId: input.conversationId,
      identifier: input.identifier,
      title: input.title,
      type: input.type,
      language: input.language,
      createdAt: input.createdAt,
    };
  }

  getArtifact(conversationId: string, identifier: string): ArtifactRecord | null {
    const row = this.#db
      .prepare(
        "SELECT id, conversation_id, identifier, title, type, language, created_at " +
          "FROM artifacts WHERE conversation_id = ? AND identifier = ?",
      )
      .get(conversationId, identifier) as ArtifactRow | undefined;
    return row ? artifactFromRow(row) : null;
  }

  listArtifacts(conversationId: string): ArtifactRecord[] {
    const rows = this.#db
      .prepare(
        "SELECT id, conversation_id, identifier, title, type, language, created_at " +
          "FROM artifacts WHERE conversation_id = ? ORDER BY id",
      )
      .all(conversationId) as ArtifactRow[];
    return rows.map(artifactFromRow);
  }

  saveArtifactVersion(input: ArtifactVersionInput): ArtifactVersionRecord {
    const version =
      input.version ??
      (
        this.#db
          .prepare(
            "SELECT COALESCE(MAX(version), 0) + 1 AS next FROM artifact_versions WHERE artifact_id = ?",
          )
          .get(input.artifactId) as { next: number }
      ).next;

    const info = this.#db
      .prepare(
        "INSERT INTO artifact_versions (artifact_id, version, content, incomplete, created_at) " +
          "VALUES (?, ?, ?, ?, ?)",
      )
      .run(input.artifactId, version, input.content, input.incomplete ? 1 : 0, input.createdAt);
    return {
      id: Number(info.lastInsertRowid),
      artifactId: input.artifactId,
      version,
      content: input.content,
      incomplete: input.incomplete,
      createdAt: input.createdAt,
    };
  }

  listArtifactVersions(artifactId: number): ArtifactVersionRecord[] {
    const rows = this.#db
      .prepare(
        "SELECT id, artifact_id, version, content, incomplete, created_at " +
          "FROM artifact_versions WHERE artifact_id = ? ORDER BY version",
      )
      .all(artifactId) as ArtifactVersionRow[];
    return rows.map(artifactVersionFromRow);
  }

  saveToolCall(record: ToolCallRecord): void {
    this.#db
      .prepare(
        "INSERT INTO tool_calls (conversation_id, call_id, seq, name, args_json, result, is_error, decision_json, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(conversation_id, call_id) DO UPDATE SET " +
          "seq = excluded.seq, name = excluded.name, args_json = excluded.args_json, " +
          "result = excluded.result, is_error = excluded.is_error, " +
          "decision_json = excluded.decision_json, created_at = excluded.created_at",
      )
      .run(
        record.conversationId,
        record.callId,
        record.seq,
        record.name,
        JSON.stringify(record.args),
        record.result,
        record.isError ? 1 : 0,
        record.decision === null ? null : JSON.stringify(record.decision),
        record.createdAt,
      );
  }

  listToolCalls(conversationId: string): ToolCallRecord[] {
    const rows = this.#db
      .prepare(
        "SELECT conversation_id, call_id, seq, name, args_json, result, is_error, decision_json, created_at " +
          "FROM tool_calls WHERE conversation_id = ? ORDER BY seq",
      )
      .all(conversationId) as ToolCallRow[];
    return rows.map((row) => ({
      conversationId: row.conversation_id,
      callId: row.call_id,
      seq: row.seq,
      name: row.name,
      args: parseJson<unknown>(row.args_json, null),
      result: row.result,
      isError: row.is_error !== 0,
      decision: parseJson<ToolCallRecord["decision"]>(row.decision_json, null),
      createdAt: row.created_at,
    }));
  }

  getSettings(key: string): unknown | null {
    const row = this.#db
      .prepare("SELECT value_json FROM settings WHERE key = ?")
      .get(key) as { value_json: string } | undefined;
    if (row === undefined) return null;
    try {
      return JSON.parse(row.value_json) as unknown;
    } catch {
      return null;
    }
  }

  saveSettings(key: string, value: unknown): void {
    this.#db
      .prepare(
        "INSERT INTO settings (key, value_json) VALUES (?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
      )
      .run(key, JSON.stringify(value));
  }

  listSettings(): Record<string, unknown> {
    const rows = this.#db
      .prepare("SELECT key, value_json FROM settings ORDER BY key")
      .all() as { key: string; value_json: string }[];
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      result[row.key] = parseJson<unknown>(row.value_json, null);
    }
    return result;
  }
}

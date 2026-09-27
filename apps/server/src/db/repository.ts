import type { ApprovalDecision, Message } from "@openartifact/shared";

/**
 * Storage repository types and interface (§11, "Persistence").
 *
 * The server persists conversations, messages (canonical {@link Message}
 * format), artifacts and their versions, the tool-call log, and non-secret
 * settings behind one swappable {@link Repository}. All call sites depend on
 * this interface, never on a concrete storage engine, so a `node:sqlite`
 * fallback can back the same contract if `better-sqlite3` fails to build.
 */

/** A stored conversation row. */
export interface ConversationRecord {
  id: string;
  title: string;
  createdAt: number;
}

/** A stored message: the canonical message plus its conversation key and order. */
export interface MessageRecord {
  conversationId: string;
  /** Monotonic per-conversation order; the key `messages` is stored under. */
  seq: number;
  message: Message;
}

/** Input for creating or updating an artifact (an identifier is unique per conversation). */
export interface ArtifactInput {
  conversationId: string;
  identifier: string;
  title: string;
  type: string;
  language: string | null;
  createdAt: number;
}

/** A stored artifact; its version list hangs off the numeric id. */
export interface ArtifactRecord extends ArtifactInput {
  id: number;
}

/** Input for appending an artifact version; `version` auto-increments when omitted. */
export interface ArtifactVersionInput {
  artifactId: number;
  version?: number;
  content: string;
  incomplete: boolean;
  createdAt: number;
}

/** A stored artifact version. */
export interface ArtifactVersionRecord {
  id: number;
  artifactId: number;
  version: number;
  content: string;
  incomplete: boolean;
  createdAt: number;
}

/** A stored tool call; `result`/`decision` are filled in as they arrive. */
export interface ToolCallRecord {
  conversationId: string;
  callId: string;
  /** Monotonic per-conversation order the calls were started. */
  seq: number;
  name: string;
  args: unknown;
  result: string | null;
  isError: boolean;
  decision: ApprovalDecision | null;
  createdAt: number;
}

/** The swappable persistence contract used by the chat and settings routes. */
export interface Repository {
  saveConversation(record: ConversationRecord): void;
  getConversation(id: string): ConversationRecord | null;
  listConversations(): ConversationRecord[];

  saveMessage(record: MessageRecord): void;
  listMessages(conversationId: string): MessageRecord[];

  /** Upsert by (conversationId, identifier), returning the stored artifact. */
  saveArtifact(input: ArtifactInput): ArtifactRecord;
  getArtifact(conversationId: string, identifier: string): ArtifactRecord | null;
  listArtifacts(conversationId: string): ArtifactRecord[];

  /** Append a version; when `version` is omitted it becomes max(version) + 1. */
  saveArtifactVersion(input: ArtifactVersionInput): ArtifactVersionRecord;
  listArtifactVersions(artifactId: number): ArtifactVersionRecord[];

  /** Upsert by (conversationId, callId), so result/decision can be added later. */
  saveToolCall(record: ToolCallRecord): void;
  listToolCalls(conversationId: string): ToolCallRecord[];

  /** Read one non-secret setting by key; `null` when it has never been set. */
  getSettings(key: string): unknown | null;
  /** Write one non-secret setting; values are JSON-serialized (§11, never secrets). */
  saveSettings(key: string, value: unknown): void;
  listSettings(): Record<string, unknown>;
}

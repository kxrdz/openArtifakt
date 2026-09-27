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
 * In-memory {@link Repository} (§11).
 *
 * Used as the default when the server is created without an on-disk database
 * (unit tests and the dev preview), so every route can depend on the
 * {@link Repository} interface regardless of engine. It mirrors the SQL
 * repository's observable behavior — upserts, monotonic ordering, and
 * auto-incrementing artifact versions — so callers are indifferent to which
 * engine is behind the contract.
 */
export class MemoryRepository implements Repository {
  #conversations = new Map<string, ConversationRecord>();
  #messages = new Map<string, MessageRecord[]>();
  #artifacts = new Map<string, ArtifactRecord[]>();
  #versions = new Map<number, ArtifactVersionRecord[]>();
  #toolCalls = new Map<string, ToolCallRecord[]>();
  #settings = new Map<string, unknown>();
  #nextArtifactId = 1;
  #nextVersionId = 1;

  saveConversation(record: ConversationRecord): void {
    this.#conversations.set(record.id, { ...record });
  }

  getConversation(id: string): ConversationRecord | null {
    const record = this.#conversations.get(id);
    return record ? { ...record } : null;
  }

  listConversations(): ConversationRecord[] {
    return [...this.#conversations.values()]
      .map((record) => ({ ...record }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  saveMessage(record: MessageRecord): void {
    const list = this.#messages.get(record.conversationId) ?? [];
    const copy: MessageRecord = {
      conversationId: record.conversationId,
      seq: record.seq,
      message: structuredClone(record.message),
    };
    const index = list.findIndex((item) => item.seq === record.seq);
    if (index === -1) list.push(copy);
    else list[index] = copy;
    list.sort((a, b) => a.seq - b.seq);
    this.#messages.set(record.conversationId, list);
  }

  listMessages(conversationId: string): MessageRecord[] {
    return (this.#messages.get(conversationId) ?? []).map((record) => ({
      conversationId: record.conversationId,
      seq: record.seq,
      message: structuredClone(record.message),
    }));
  }

  saveArtifact(input: ArtifactInput): ArtifactRecord {
    const list = this.#artifacts.get(input.conversationId) ?? [];
    const existing = list.find((artifact) => artifact.identifier === input.identifier);
    if (existing) {
      const updated: ArtifactRecord = {
        ...existing,
        title: input.title,
        type: input.type,
        language: input.language,
        createdAt: input.createdAt,
      };
      list[list.indexOf(existing)] = updated;
      return { ...updated };
    }

    const record: ArtifactRecord = {
      id: this.#nextArtifactId,
      conversationId: input.conversationId,
      identifier: input.identifier,
      title: input.title,
      type: input.type,
      language: input.language,
      createdAt: input.createdAt,
    };
    this.#nextArtifactId += 1;
    list.push(record);
    this.#artifacts.set(input.conversationId, list);
    return { ...record };
  }

  getArtifact(conversationId: string, identifier: string): ArtifactRecord | null {
    const record = (this.#artifacts.get(conversationId) ?? []).find(
      (artifact) => artifact.identifier === identifier,
    );
    return record ? { ...record } : null;
  }

  listArtifacts(conversationId: string): ArtifactRecord[] {
    return (this.#artifacts.get(conversationId) ?? []).map((record) => ({ ...record }));
  }

  saveArtifactVersion(input: ArtifactVersionInput): ArtifactVersionRecord {
    const list = this.#versions.get(input.artifactId) ?? [];
    const version =
      input.version ?? list.reduce((max, record) => Math.max(max, record.version), 0) + 1;
    const record: ArtifactVersionRecord = {
      id: this.#nextVersionId,
      artifactId: input.artifactId,
      version,
      content: input.content,
      incomplete: input.incomplete,
      createdAt: input.createdAt,
    };
    this.#nextVersionId += 1;
    list.push(record);
    this.#versions.set(input.artifactId, list);
    return { ...record };
  }

  listArtifactVersions(artifactId: number): ArtifactVersionRecord[] {
    return (this.#versions.get(artifactId) ?? [])
      .map((record) => ({ ...record }))
      .sort((a, b) => a.version - b.version);
  }

  saveToolCall(record: ToolCallRecord): void {
    const list = this.#toolCalls.get(record.conversationId) ?? [];
    const copy: ToolCallRecord = {
      ...record,
      args: structuredClone(record.args),
      decision: record.decision === null ? null : structuredClone(record.decision),
    };
    const index = list.findIndex((item) => item.callId === record.callId);
    if (index === -1) list.push(copy);
    else list[index] = copy;
    list.sort((a, b) => a.seq - b.seq);
    this.#toolCalls.set(record.conversationId, list);
  }

  listToolCalls(conversationId: string): ToolCallRecord[] {
    return (this.#toolCalls.get(conversationId) ?? []).map((record) => ({
      ...record,
      args: structuredClone(record.args),
      decision: record.decision === null ? null : structuredClone(record.decision),
    }));
  }

  getSettings(key: string): unknown | null {
    const value = this.#settings.get(key);
    return value === undefined ? null : structuredClone(value);
  }

  saveSettings(key: string, value: unknown): void {
    this.#settings.set(key, structuredClone(value));
  }

  listSettings(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.#settings) {
      result[key] = structuredClone(value);
    }
    return result;
  }
}

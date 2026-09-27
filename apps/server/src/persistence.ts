import type { AgentEvent } from "@openartifact/core";
import type { ContentPart, Message } from "@openartifact/shared";
import { parseDocument } from "@openartifact/shared";

import type { Repository, ToolCallRecord } from "./db";

/**
 * Chat-transport persistence (§12.8, design decision 3).
 *
 * The agent loop is transport-agnostic and must not know about SQLite; the
 * chat transport observes every loop event and writes the conversation,
 * messages (canonical {@link Message} format), the tool-call log and derived
 * artifact versions to a {@link Repository} as they stream, so a reload can
 * restore them exactly. Artifacts are derived by feeding the conversation's
 * accumulated assistant text through the shared `parseDocument`, so persisted
 * versions match what the web renders.
 */

/** Cap a conversation title so the list stays compact. */
const TITLE_MAX = 60;

/** Fold a user's first message into a single-line conversation title. */
export function conversationTitle(text: string): string {
  const single = text.trim().replace(/\s+/g, " ");
  if (single.length <= TITLE_MAX) return single;
  return `${single.slice(0, TITLE_MAX - 1)}…`;
}

/** Concatenate the text parts of every assistant message, in order. */
function assistantText(messages: Message[]): string {
  let text = "";
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "text") text += part.text;
    }
  }
  return text;
}

/** The current assistant message being reconstructed from stream events. */
interface AssistantDraft {
  seq: number;
  createdAt: number;
  text: string;
  /** Tool-call parts in first-appearance order (after the text part). */
  toolCallParts: ContentPart[];
}

/** A patch of tool-call fields applied as a call's lifecycle advances. */
interface ToolCallPatch {
  name?: string;
  args?: unknown;
  result?: string;
  isError?: boolean;
  decision?: ToolCallRecord["decision"];
}

/**
 * Writes one user turn's messages, tool calls and artifact versions to a
 * repository as the loop streams. Feed every {@link AgentEvent} to
 * {@link onEvent}, then call {@link finish} once the turn ends.
 */
export class TurnPersistence {
  readonly #repo: Repository;
  readonly #conversationId: string;
  #nextSeq: number;
  #toolSeq = 0;
  #assistant: AssistantDraft | null = null;
  #assistantCallIds = new Set<string>();
  #toolCalls = new Map<string, ToolCallRecord>();
  #finished = false;

  constructor(repo: Repository, conversationId: string) {
    this.#repo = repo;
    this.#conversationId = conversationId;
    // Continuing a conversation resumes the message order from what's stored.
    this.#nextSeq = repo.listMessages(conversationId).length;
  }

  /** Persist the user message (and the conversation row on first use). */
  beginTurn(userText: string): void {
    if (this.#repo.getConversation(this.#conversationId) === null) {
      this.#repo.saveConversation({
        id: this.#conversationId,
        title: conversationTitle(userText),
        createdAt: Date.now(),
      });
    }
    this.#writeMessage("user", [{ type: "text", text: userText }]);
  }

  /** Observe one loop event and persist the messages/tool-call log it implies. */
  onEvent(event: AgentEvent): void {
    switch (event.type) {
      case "text":
        this.#onText(event.text);
        break;
      case "approval_request":
        this.#onToolStart(event.callId, event.name, event.args);
        break;
      case "approval_decision":
        this.#upsertToolCall(event.callId, { decision: event.decision });
        break;
      case "tool_start":
        this.#onToolStart(event.callId, event.name, event.args);
        break;
      case "tool_result":
        this.#onToolResult(event.callId, event.content, event.isError);
        break;
      case "state":
      case "done":
      case "error":
        // Nothing to persist for these; `finish()` finalizes on turn end.
        break;
    }
  }

  /** Finalize the turn: flush the assistant message and derive artifact versions. */
  finish(): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#flushAssistant();
    this.#persistArtifacts();
  }

  #onText(text: string): void {
    // Text only arrives at the start of a provider turn; if the current
    // assistant message already carries tool calls, a new one has begun.
    if (this.#assistant === null || this.#assistant.toolCallParts.length > 0) {
      this.#assistant = {
        seq: this.#nextSeq,
        createdAt: Date.now(),
        text: "",
        toolCallParts: [],
      };
      this.#nextSeq += 1;
    }
    this.#assistant.text += text;
    this.#flushAssistant();
  }

  #onToolStart(callId: string, name: string, args: unknown): void {
    this.#ensureAssistant();
    if (!this.#assistantCallIds.has(callId)) {
      this.#assistantCallIds.add(callId);
      this.#assistant?.toolCallParts.push({ type: "tool_call", id: callId, name, args });
    }
    this.#flushAssistant();
    // `tool_start` carries the final arguments (post edit-command); store them.
    this.#upsertToolCall(callId, { name, args });
  }

  #onToolResult(callId: string, content: string, isError: boolean | undefined): void {
    this.#writeMessage("tool", [
      { type: "tool_result", callId, content, ...(isError ? { isError } : {}) },
    ]);
    this.#upsertToolCall(callId, { result: content, isError: isError ?? false });
  }

  #ensureAssistant(): void {
    if (this.#assistant === null) {
      this.#assistant = {
        seq: this.#nextSeq,
        createdAt: Date.now(),
        text: "",
        toolCallParts: [],
      };
      this.#nextSeq += 1;
    }
  }

  #flushAssistant(): void {
    if (this.#assistant === null) return;
    const parts: ContentPart[] = [];
    if (this.#assistant.text !== "") parts.push({ type: "text", text: this.#assistant.text });
    parts.push(...this.#assistant.toolCallParts);
    this.#repo.saveMessage({
      conversationId: this.#conversationId,
      seq: this.#assistant.seq,
      message: {
        id: this.#messageId(this.#assistant.seq),
        role: "assistant",
        parts,
        createdAt: this.#assistant.createdAt,
      },
    });
  }

  #writeMessage(
    role: "user" | "assistant" | "tool",
    parts: ContentPart[],
  ): void {
    const seq = this.#nextSeq;
    this.#nextSeq += 1;
    this.#repo.saveMessage({
      conversationId: this.#conversationId,
      seq,
      message: { id: this.#messageId(seq), role, parts, createdAt: Date.now() },
    });
  }

  #messageId(seq: number): string {
    return `msg-${this.#conversationId}-${seq}`;
  }

  #upsertToolCall(callId: string, patch: ToolCallPatch): void {
    let record = this.#toolCalls.get(callId);
    if (record === undefined) {
      record = {
        conversationId: this.#conversationId,
        callId,
        seq: this.#toolSeq,
        name: patch.name ?? "",
        args: patch.args ?? null,
        result: null,
        isError: false,
        decision: null,
        createdAt: Date.now(),
      };
      this.#toolSeq += 1;
      this.#toolCalls.set(callId, record);
    }
    if (patch.name !== undefined) record.name = patch.name;
    if (patch.args !== undefined) record.args = patch.args;
    if (patch.result !== undefined) record.result = patch.result;
    if (patch.isError !== undefined) record.isError = patch.isError;
    if (patch.decision !== undefined) record.decision = patch.decision;
    this.#repo.saveToolCall(record);
  }

  /** Derive artifacts from the full conversation text and append missing versions. */
  #persistArtifacts(): void {
    const text = assistantText(
      this.#repo.listMessages(this.#conversationId).map((record) => record.message),
    );
    const document = parseDocument(text);

    for (const artifact of document.artifacts) {
      // Only insert the artifact once, so its original createdAt survives.
      let saved = this.#repo.getArtifact(this.#conversationId, artifact.identifier);
      if (saved === null) {
        saved = this.#repo.saveArtifact({
          conversationId: this.#conversationId,
          identifier: artifact.identifier,
          title: artifact.title,
          type: artifact.artifactType,
          language: artifact.language ?? null,
          createdAt: Date.now(),
        });
      }

      // Versions are append-only and derived idempotently from the stable text;
      // only versions that are not yet stored (e.g. this turn's) are inserted.
      const existing = new Set(
        this.#repo.listArtifactVersions(saved.id).map((version) => version.version),
      );
      for (const version of artifact.versions) {
        if (existing.has(version.version)) continue;
        this.#repo.saveArtifactVersion({
          artifactId: saved.id,
          version: version.version,
          content: version.content,
          incomplete: version.incomplete,
          createdAt: Date.now(),
        });
        existing.add(version.version);
      }
    }
  }
}

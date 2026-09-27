import {
  parseConversationHistory,
  parseConversationSummary,
  type ContentPart,
  type ConversationHistory,
  type ConversationSummary,
  type HistoryToolCall,
} from "@openartifact/shared";

import { useArtifactStore } from "../artifacts";
import type { Artifact } from "../artifacts";
import {
  useChatStore,
  type ChatMessage,
  type ToolCallState,
  type ToolCallStatus,
} from "../store/chatStore";

/**
 * Conversation history client (§12.8, "Restore on load").
 *
 * Talks to the server's history endpoints (`GET /api/conversations`,
 * `GET /api/conversations/:id`), validates the responses against the shared
 * wire schemas, and hydrates the chat and artifact stores. Pure hydration
 * (`hydrateMessages`, `hydrateArtifacts`) is split from the fetchers so tests
 * can drive the store transition without a server; the orchestrators
 * (`loadConversations`, `restoreConversation`) glue the two together and live
 * here — not in the stores — so neither store has to import the other.
 */

/** Concatenate the text parts of one canonical message. */
function textContent(parts: ContentPart[]): string {
  let text = "";
  for (const part of parts) {
    if (part.type === "text") text += part.text;
  }
  return text;
}

/** True for a `tool_call` content part (narrows `ContentPart`). */
function isToolCallPart(part: ContentPart): part is Extract<ContentPart, { type: "tool_call" }> {
  return part.type === "tool_call";
}

/** Build one restored tool call from its message part and its log record. */
function hydrateToolCall(
  part: Extract<ContentPart, { type: "tool_call" }>,
  log: HistoryToolCall | undefined,
): ToolCallState {
  if (log === undefined) {
    return { callId: part.id, name: part.name, args: part.args, status: "running" };
  }
  const status: ToolCallStatus =
    log.result !== null ? (log.isError ? "error" : "done") : "running";
  const toolCall: ToolCallState = {
    callId: part.id,
    name: log.name,
    args: log.args,
    status,
  };
  if (log.result !== null) {
    toolCall.result = log.result;
    toolCall.isError = log.isError;
  }
  if (log.decision !== null) toolCall.decision = log.decision;
  return toolCall;
}

/**
 * Fold a conversation's canonical messages and tool-call log into the chat
 * store's {@link ChatMessage} list (pure). `tool` messages carry the results of
 * the preceding assistant message's calls; those results are already in the
 * tool-call log, so they are dropped here rather than rendered as messages.
 */
export function hydrateMessages(history: ConversationHistory): ChatMessage[] {
  const toolLog = new Map(history.toolCalls.map((call) => [call.callId, call]));
  const messages: ChatMessage[] = [];

  for (const message of history.messages) {
    if (message.role === "user") {
      messages.push({
        id: message.id,
        role: "user",
        content: textContent(message.parts),
        toolCalls: [],
        createdAt: message.createdAt,
      });
      continue;
    }
    if (message.role === "assistant") {
      messages.push({
        id: message.id,
        role: "assistant",
        content: textContent(message.parts),
        toolCalls: message.parts
          .filter(isToolCallPart)
          .map((part) => hydrateToolCall(part, toolLog.get(part.id))),
        createdAt: message.createdAt,
      });
      continue;
    }
    // `tool` role: results live in the tool-call log and on the assistant card.
  }

  return messages;
}

/**
 * Convert the persisted artifact history into the web {@link Artifact} model
 * (pure). Every version is kept, in order — never just the latest (§12.8).
 */
export function hydrateArtifacts(history: ConversationHistory): Artifact[] {
  return history.artifacts.map((artifact) => {
    const versions = artifact.versions.map((version) => ({
      version: version.version,
      content: version.content,
      incomplete: version.incomplete,
    }));
    const latest = versions[versions.length - 1];
    return {
      identifier: artifact.identifier,
      title: artifact.title,
      artifactType: artifact.type,
      ...(artifact.language !== null ? { language: artifact.language } : {}),
      versions,
      incomplete: latest?.incomplete ?? false,
    };
  });
}

/** `GET /api/conversations` — the persisted conversation list. */
export async function fetchConversationList(
  signal?: AbortSignal,
): Promise<ConversationSummary[]> {
  const response = await fetch("/api/conversations", { signal });
  if (!response.ok) {
    throw new Error(`Failed to load conversations (${response.status})`);
  }
  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("Conversation list response was not an array");
  }
  return data.map((item) => parseConversationSummary(item));
}

/** `GET /api/conversations/:id` — one conversation's full persisted history. */
export async function fetchConversationHistory(
  id: string,
  signal?: AbortSignal,
): Promise<ConversationHistory> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load conversation (${response.status})`);
  }
  return parseConversationHistory((await response.json()) as unknown);
}

/** Load the conversation list into the chat store on startup. */
export async function loadConversations(): Promise<void> {
  useChatStore.getState().setHistoryStatus("loading");
  try {
    const conversations = await fetchConversationList();
    useChatStore.getState().setConversations(conversations);
    useChatStore.getState().setHistoryStatus("ready");
  } catch (error) {
    useChatStore.getState().setHistoryStatus("error");
    throw error;
  }
}

/** Restore one conversation's messages, tool-call log and artifact versions. */
export async function restoreConversation(id: string): Promise<void> {
  useChatStore.getState().setHistoryStatus("restoring");
  try {
    const history = await fetchConversationHistory(id);
    const messages = hydrateMessages(history);
    const artifacts = hydrateArtifacts(history);
    useChatStore.getState().applyRestoredConversation(id, messages);
    useArtifactStore.getState().restoreArtifacts(artifacts);
    useChatStore.getState().setHistoryStatus("ready");
  } catch (error) {
    useChatStore.getState().setHistoryStatus("error");
    throw error;
  }
}

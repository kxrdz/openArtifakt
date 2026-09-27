import { create } from "zustand";

import {
  parseChatEvent,
  parseUndoResponse,
  type AgentState,
  type ApprovalDecision,
  type ApprovalRequestEvent,
  type ChatEvent,
  type ConversationSummary,
  type UndoResponse,
} from "@openartifact/shared";

import { readSseEvents } from "../lib/sse";

/**
 * Chat store (§12.6, "Web chat store + SSE client").
 *
 * A Zustand store that drives one conversation over the chat transport and
 * reflects the agent loop's streamed state. It holds the message list, the
 * always-visible agent state, the terminal log, and the pending approval, and
 * exposes `send`, `stop` and `decide` actions. Events from the server reduce
 * through the pure {@link applyChatEvent}, which keeps the transition logic
 * unit-testable without a network.
 */

/** A tool call shown on its assistant message (running / waiting / done / error). */
export type ToolCallStatus = "running" | "awaiting_approval" | "done" | "error";

/** The client's view of one tool call attached to an assistant message. */
export interface ToolCallState {
  callId: string;
  name: string;
  args: unknown;
  status: ToolCallStatus;
  /** Tool result content, once the call finished (or was rejected). */
  result?: string;
  isError?: boolean;
  /** The user's approval decision, restored from the persisted tool-call log. */
  decision?: ApprovalDecision;
}

/** A chat message: a user turn or an assistant turn with its tool calls. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCallState[];
  createdAt: number;
}

/** One chunk of streamed command output. */
export interface TerminalLine {
  stream: "stdout" | "stderr";
  text: string;
}

export type HistoryStatus = "idle" | "loading" | "ready" | "error" | "restoring";

/** The reducible data shape of the store (everything except the actions). */
export interface ChatState {
  conversationId: string | null;
  agentState: AgentState;
  messages: ChatMessage[];
  terminalLines: TerminalLine[];
  pendingApproval: ApprovalRequestEvent | null;
  /** Last transport/turn error, shown in the UI. */
  error: string | null;
  /** True while a turn is in flight (Send becomes Stop). */
  isSending: boolean;
  /** Persisted conversations, loaded on startup (feature 8, §12.8). */
  conversations: ConversationSummary[];
  /** Loading/restore status of the conversation list (driven by lib/history). */
  historyStatus: HistoryStatus;
}

export const initialChatState: ChatState = {
  conversationId: null,
  agentState: "idle",
  messages: [],
  terminalLines: [],
  pendingApproval: null,
  error: null,
  isSending: false,
  conversations: [],
  historyStatus: "idle",
};

/**
 * The transport the store talks to. Split out so tests inject a scripted fake
 * and drive the full transition without a server.
 */
export interface ChatTransport {
  /** Stream one turn, invoking `onEvent` for every parsed {@link ChatEvent}. */
  stream: (input: {
    message: string;
    conversationId?: string;
    signal: AbortSignal;
    onEvent: (event: ChatEvent) => void;
  }) => Promise<void>;
  /** Submit an approval decision for a pending approval. */
  decide: (input: { conversationId: string; decision: ApprovalDecision }) => Promise<void>;
  /** Ask the server to cancel the in-flight turn. */
  stop: (input: { conversationId: string }) => Promise<void>;
  /** Undo a completed turn, restoring its pre-mutation snapshots (§8). */
  undo: (input: { conversationId: string; turn: number }) => Promise<UndoResponse>;
}

/** Read a JSON error body, falling back to a generic message. */
async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

/** The default transport: the local server over `fetch` + SSE-over-fetch. */
export const defaultChatTransport: ChatTransport = {
  async stream({ message, conversationId, signal, onEvent }) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, ...(conversationId !== undefined ? { conversationId } : {}) }),
      signal,
    });
    if (!response.ok) {
      throw new Error(await readError(response, `Chat request failed (${response.status})`));
    }
    if (response.body === null) {
      throw new Error("Chat stream returned no response body");
    }

    for await (const frame of readSseEvents(response.body)) {
      if (frame.data === "") continue;
      try {
        onEvent(parseChatEvent(JSON.parse(frame.data) as unknown));
      } catch {
        // Skip frames that don't match the shared wire contract.
      }
    }
  },

  async decide({ conversationId, decision }) {
    const response = await fetch(`/api/chat/${encodeURIComponent(conversationId)}/approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(decision),
    });
    if (!response.ok) {
      throw new Error(await readError(response, `Approval failed (${response.status})`));
    }
  },

  async stop({ conversationId }) {
    const response = await fetch(`/api/chat/${encodeURIComponent(conversationId)}/stop`, {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(await readError(response, `Stop failed (${response.status})`));
    }
  },

  async undo({ conversationId, turn }) {
    const response = await fetch(
      `/api/conversations/${encodeURIComponent(conversationId)}/undo?turn=${encodeURIComponent(String(turn))}`,
      { method: "POST" },
    );
    if (!response.ok) {
      throw new Error(await readError(response, `Undo failed (${response.status})`));
    }
    return parseUndoResponse((await response.json()) as unknown);
  },
};

/** The full store: the data shape plus the actions and the in-flight controller. */
export interface ChatStore extends ChatState {
  abortController: AbortController | null;
  send: (message: string) => Promise<void>;
  stop: () => void;
  decide: (decision: ApprovalDecision) => Promise<void>;
  /** Undo a completed turn by its 1-based turn number; throws on failure. */
  undoTurn: (turn: number) => Promise<UndoResponse>;
  /** Set the conversation-list loading/restore status (driven by lib/history). */
  setHistoryStatus: (status: HistoryStatus) => void;
  /** Replace the conversation list (driven by lib/history). */
  setConversations: (conversations: ConversationSummary[]) => void;
  /** Replace the live conversation with a restored one (artifact store stays out). */
  applyRestoredConversation: (conversationId: string, messages: ChatMessage[]) => void;
  /** Dismiss the surfaced transport/turn error banner. */
  clearError: () => void;
  /** Clear the conversation (used by tests and the "new chat" action). */
  reset: () => void;
}

let idCounter = 0;

/** A monotonic, collision-free id for messages (browser + node). */
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now().toString(36)}`;
}

/** True for DOM-style abort errors (thrown when a fetch is aborted). */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const lastAssistantIndex = (messages: ChatMessage[]): number => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") return i;
  }
  return -1;
};

const mapLastAssistant = (
  messages: ChatMessage[],
  transform: (message: ChatMessage) => ChatMessage,
): ChatMessage[] => {
  const index = lastAssistantIndex(messages);
  if (index === -1) return messages;
  return messages.map((message, i) => (i === index ? transform(message) : message));
};

/** Add or update a tool call on the current assistant message. */
function upsertToolCall(messages: ChatMessage[], toolCall: ToolCallState): ChatMessage[] {
  return mapLastAssistant(messages, (message) => {
    const exists = message.toolCalls.some((call) => call.callId === toolCall.callId);
    const toolCalls = exists
      ? message.toolCalls.map((call) => (call.callId === toolCall.callId ? { ...call, ...toolCall } : call))
      : [...message.toolCalls, toolCall];
    return { ...message, toolCalls };
  });
}

/** Update an existing tool call on the current assistant message. */
function updateToolCall(
  messages: ChatMessage[],
  callId: string,
  patch: Partial<ToolCallState>,
): ChatMessage[] {
  return mapLastAssistant(messages, (message) => ({
    ...message,
    toolCalls: message.toolCalls.map((call) => (call.callId === callId ? { ...call, ...patch } : call)),
  }));
}

/**
 * Reduce one {@link ChatEvent} into the next {@link ChatState} (pure).
 *
 * Text appends to the in-progress assistant message; tool events build and
 * update that message's tool calls; `approval_request` records the pending
 * approval and pauses its tool call; command output accumulates into the
 * terminal log.
 */
export function applyChatEvent(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case "conversation":
      return { ...state, conversationId: event.conversationId };

    case "state":
      return { ...state, agentState: event.state };

    case "text":
      return {
        ...state,
        messages: mapLastAssistant(state.messages, (message) => ({
          ...message,
          content: message.content + event.text,
        })),
      };

    case "tool_start":
      return {
        ...state,
        messages: upsertToolCall(state.messages, {
          callId: event.callId,
          name: event.name,
          args: event.args,
          status: "running",
        }),
      };

    case "tool_result":
      return {
        ...state,
        messages: updateToolCall(state.messages, event.callId, {
          status: event.isError ? "error" : "done",
          result: event.content,
          isError: event.isError,
        }),
      };

    case "approval_request":
      return {
        ...state,
        pendingApproval: event,
        messages: upsertToolCall(state.messages, {
          callId: event.callId,
          name: event.name,
          args: event.args,
          status: "awaiting_approval",
        }),
      };

    case "approval_decision":
      // A rejected tool does not run; it is marked done and the loop's
      // `tool_result` (the note) follows. Approve / edit-command resume it.
      return {
        ...state,
        pendingApproval: null,
        messages: updateToolCall(state.messages, event.callId, {
          status: event.decision.kind === "reject" ? "done" : "running",
        }),
      };

    case "command_output":
      return {
        ...state,
        terminalLines: [...state.terminalLines, { stream: event.stream, text: event.text }],
      };

    case "done":
      // The preceding `state` event already set `done`/`cancelled`; the stop
      // reason is not shown separately in the UI.
      return state;

    case "error":
      return { ...state, error: event.message };
  }
}

/** Create a chat store wired to a transport (injected in tests). */
export function createChatStore(transport: ChatTransport = defaultChatTransport) {
  return create<ChatStore>()((set, get) => ({
    ...initialChatState,
    abortController: null,

    send: async (message) => {
      if (message.trim() === "" || get().isSending) return;

      const controller = new AbortController();
      set((state) => ({
        ...state,
        isSending: true,
        error: null,
        abortController: controller,
        messages: [
          ...state.messages,
          {
            id: nextId("msg"),
            role: "user",
            content: message,
            toolCalls: [],
            createdAt: Date.now(),
          },
          {
            id: nextId("msg"),
            role: "assistant",
            content: "",
            toolCalls: [],
            createdAt: Date.now(),
          },
        ],
      }));

      try {
        await transport.stream({
          message,
          conversationId: get().conversationId ?? undefined,
          signal: controller.signal,
          onEvent: (event) => set((state) => applyChatEvent(state, event)),
        });
      } catch (error) {
        if (isAbortError(error)) {
          set((state) => ({ ...state, agentState: "cancelled" }));
        } else {
          set((state) => ({ ...state, agentState: "error", error: errorMessage(error) }));
        }
      } finally {
        set((state) => ({ ...state, isSending: false, abortController: null }));
      }
    },

    stop: () => {
      const { isSending, conversationId } = get();
      if (!isSending) return;
      if (conversationId !== null) {
        void transport
          .stop({ conversationId })
          .catch((error) => set((state) => ({ ...state, error: errorMessage(error) })));
      }
      // The server closes the stream after cancelling (the loop emits
      // `state: cancelled` + `done: cancelled`); flip the status immediately
      // for feedback and let the stream's end clear `isSending`.
      set((state) => ({ ...state, agentState: "cancelled" }));
    },

    decide: async (decision) => {
      const { conversationId, pendingApproval } = get();
      if (pendingApproval === null || conversationId === null) return;
      // Clear the card immediately; the loop's `approval_decision` event
      // re-asserts and resumes the tool call.
      set((state) => ({ ...state, pendingApproval: null }));
      try {
        await transport.decide({ conversationId, decision });
      } catch (error) {
        set((state) => ({ ...state, error: errorMessage(error) }));
      }
    },

    undoTurn: async (turn) => {
      const { conversationId } = get();
      if (conversationId === null) {
        throw new Error("No active conversation to undo.");
      }
      return transport.undo({ conversationId, turn });
    },

    setHistoryStatus: (historyStatus) => set({ historyStatus }),

    setConversations: (conversations) => set({ conversations }),

    applyRestoredConversation: (conversationId, messages) => {
      get().abortController?.abort();
      set({
        conversationId,
        messages,
        agentState: "idle",
        terminalLines: [],
        pendingApproval: null,
        error: null,
        isSending: false,
        abortController: null,
      });
    },

    clearError: () => set({ error: null }),

    reset: () => {
      get().abortController?.abort();
      set((state) => ({
        ...initialChatState,
        abortController: null,
        // A "new chat" clears the live conversation but keeps the persisted
        // conversation list, so the user can switch back without a reload.
        conversations: state.conversations,
        historyStatus: state.historyStatus,
      }));
    },
  }));
}

/** The app-wide singleton store. */
export const useChatStore = createChatStore();

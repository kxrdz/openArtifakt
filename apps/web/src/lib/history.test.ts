import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConversationHistory } from "@openartifact/shared";

import { useArtifactStore } from "../artifacts";
import {
  fetchConversationHistory,
  fetchConversationList,
  hydrateArtifacts,
  hydrateMessages,
  loadConversations,
  restoreConversation,
} from "./history";
import { useChatStore } from "../store/chatStore";

/**
 * A persisted conversation with two turns: the first writes a file (approved)
 * and produces the first version of a React artifact; the second reuses the
 * artifact identifier to append a second version.
 */
function makeHistory(): ConversationHistory {
  return {
    conversation: { id: "conv-1", title: "Build a counter", createdAt: 1700000000000 },
    messages: [
      {
        id: "msg-conv-1-0",
        role: "user",
        parts: [{ type: "text", text: "Build a counter component." }],
        createdAt: 1700000001000,
      },
      {
        id: "msg-conv-1-1",
        role: "assistant",
        parts: [
          { type: "text", text: "I'll write the component.\n" },
          {
            type: "tool_call",
            id: "call-1",
            name: "write_file",
            args: { path: "src/Counter.tsx" },
          },
        ],
        createdAt: 1700000002000,
      },
      {
        id: "msg-conv-1-2",
        role: "tool",
        parts: [
          { type: "tool_result", callId: "call-1", content: "wrote src/Counter.tsx", isError: false },
        ],
        createdAt: 1700000003000,
      },
      {
        id: "msg-conv-1-3",
        role: "assistant",
        parts: [
          {
            type: "text",
            text:
              '<artifact identifier="counter" type="application/vnd.react" title="Counter" language="tsx">\n' +
              "export default function Counter() { return <button>0</button>; }\n" +
              "</artifact>\n",
          },
        ],
        createdAt: 1700000004000,
      },
      {
        id: "msg-conv-1-4",
        role: "user",
        parts: [{ type: "text", text: "Now make it count up." }],
        createdAt: 1700000005000,
      },
      {
        id: "msg-conv-1-5",
        role: "assistant",
        parts: [
          {
            type: "text",
            text:
              '<artifact identifier="counter" type="application/vnd.react" title="Counter" language="tsx">\n' +
              "export default function Counter() { return <button>1</button>; }\n" +
              "</artifact>\n",
          },
        ],
        createdAt: 1700000006000,
      },
    ],
    artifacts: [
      {
        identifier: "counter",
        title: "Counter",
        type: "application/vnd.react",
        language: "tsx",
        createdAt: 1700000004000,
        versions: [
          {
            version: 1,
            content: "export default function Counter() { return <button>0</button>; }",
            incomplete: false,
            createdAt: 1700000004000,
          },
          {
            version: 2,
            content: "export default function Counter() { return <button>1</button>; }",
            incomplete: false,
            createdAt: 1700000006000,
          },
        ],
      },
    ],
    toolCalls: [
      {
        callId: "call-1",
        seq: 0,
        name: "write_file",
        args: { path: "src/Counter.tsx" },
        result: "wrote src/Counter.tsx",
        isError: false,
        decision: { kind: "approve" },
        createdAt: 1700000002000,
      },
    ],
  };
}

/** A minimal JSON `Response` for the stubbed `fetch`. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("hydrateMessages", () => {
  it("restores user and assistant messages and folds the tool-call log onto cards", () => {
    const history = makeHistory();
    const messages = hydrateMessages(history);

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(messages[1]).toMatchObject({
      id: "msg-conv-1-1",
      role: "assistant",
      content: "I'll write the component.\n",
    });
    expect(messages[1]?.toolCalls).toEqual([
      {
        callId: "call-1",
        name: "write_file",
        args: { path: "src/Counter.tsx" },
        status: "done",
        result: "wrote src/Counter.tsx",
        isError: false,
        decision: { kind: "approve" },
      },
    ]);
    // The interleaved `tool` message is not rendered as its own message: the
    // roles array above already shows no `tool` entries between assistants.
  });
});

describe("hydrateArtifacts", () => {
  it("maps the persisted artifact history onto the web model with every version", () => {
    const artifacts = hydrateArtifacts(makeHistory());

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toEqual({
      identifier: "counter",
      title: "Counter",
      artifactType: "application/vnd.react",
      language: "tsx",
      incomplete: false,
      versions: [
        {
          version: 1,
          content: "export default function Counter() { return <button>0</button>; }",
          incomplete: false,
        },
        {
          version: 2,
          content: "export default function Counter() { return <button>1</button>; }",
          incomplete: false,
        },
      ],
    });
  });
});

describe("history client + store hydration", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useChatStore.getState().setHistoryStatus("idle");
    useChatStore.getState().setConversations([]);
    useArtifactStore.getState().clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the conversation list on startup", async () => {
    const history = makeHistory();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([history.conversation])),
    );

    const result = await fetchConversationList();
    expect(result).toEqual([history.conversation]);

    await loadConversations();
    expect(useChatStore.getState().conversations).toEqual([history.conversation]);
    expect(useChatStore.getState().historyStatus).toBe("ready");
  });

  it("restores a stored history into both stores, including multi-version artifacts", async () => {
    const history = makeHistory();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "/api/conversations") return jsonResponse([history.conversation]);
      if (url === `/api/conversations/${history.conversation.id}`) {
        return jsonResponse(history);
      }
      return jsonResponse({ error: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    await restoreConversation(history.conversation.id);

    // Chat store: messages + conversation id restored, tool-call log on the card.
    const chat = useChatStore.getState();
    expect(chat.conversationId).toBe("conv-1");
    expect(chat.historyStatus).toBe("ready");
    expect(chat.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(chat.messages[1]?.toolCalls[0]).toMatchObject({
      callId: "call-1",
      name: "write_file",
      status: "done",
      result: "wrote src/Counter.tsx",
      decision: { kind: "approve" },
    });

    // Artifact store: the full version list is restored, never just the latest.
    const artifacts = useArtifactStore.getState().artifacts;
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.versions).toHaveLength(2);
    expect(artifacts[0]?.versions.map((version) => version.content)).toEqual([
      "export default function Counter() { return <button>0</button>; }",
      "export default function Counter() { return <button>1</button>; }",
    ]);
    expect(useArtifactStore.getState().selectedId).toBe("counter");
  });

  it("records an error status when the history fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Unknown conversation" }, 404)),
    );

    await expect(restoreConversation("missing")).rejects.toThrow();
    expect(useChatStore.getState().historyStatus).toBe("error");
  });

  it("validates the history endpoint responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ conversation: null, messages: "nope" })),
    );

    await expect(fetchConversationHistory("conv-1")).rejects.toThrow();
  });
});

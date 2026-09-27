import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ProviderAdapter } from "@openartifact/core";
import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadConfig } from "../config";
import { createFakeWorkspace, FAKE_NOTES_FILE } from "../fake";
import { FAKE_FINAL_TEXT, FAKE_FIXTURE_TURNS, FakeServerProvider } from "../fake/provider";
import { SESSION_COOKIE_NAME } from "../security";

/** A parsed SSE frame: its `event:` name and its JSON `data`. */
interface SseFrame {
  event?: string;
  data: string;
}

/** Parse one blank-line-delimited SSE block into its event name and data lines. */
function parseSseBlock(block: string): SseFrame | null {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trimStart());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

/** Read an SSE response body, yielding each parsed frame as it arrives. */
async function* readSse(res: Response): AsyncGenerator<SseFrame> {
  const reader = res.body?.getReader();
  if (reader === undefined) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const frame = parseSseBlock(block);
        if (frame !== null) yield frame;
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim() !== "") {
      const frame = parseSseBlock(buffer);
      if (frame !== null) yield frame;
    }
  } finally {
    reader.releaseLock();
  }
}

/** A wire event as parsed from `data`. */
type WireEvent = { type: string } & Record<string, unknown>;

interface AppUnderTest {
  app: ReturnType<typeof createApp>;
  cookie: string;
  workspaceRoot: string;
  cleanup: () => Promise<void>;
}

/** A fake-provider app over a seeded temp workspace. */
async function fakeApp(providerFactory?: () => ProviderAdapter): Promise<AppUnderTest> {
  const workspace = await createFakeWorkspace();
  const config = {
    ...loadConfig({ OPENARTIFACT_FAKE_PROVIDER: "1" }),
    workspaceRoot: workspace.root,
  };
  const app = createApp({
    config,
    sessionToken: "test-token",
    ...(providerFactory ? { providerFactory } : {}),
  });
  return {
    app,
    cookie: `${SESSION_COOKIE_NAME}=test-token`,
    workspaceRoot: workspace.root,
    cleanup: workspace.cleanup,
  };
}

/** POST /api/chat and return the streaming response. */
async function postChat(
  app: AppUnderTest["app"],
  cookie: string,
  body: { message: string; conversationId?: string },
): Promise<Response> {
  return app.request("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

/** POST an approval decision for a conversation. */
async function postDecision(
  app: AppUnderTest["app"],
  cookie: string,
  conversationId: string,
  decision: unknown,
): Promise<Response> {
  return app.request(`/api/chat/${conversationId}/approval`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(decision),
  });
}

/** Drive one full turn, applying `decide` to every approval request. */
async function driveTurn(
  app: AppUnderTest["app"],
  cookie: string,
  message: string,
  decide: (event: WireEvent) => unknown,
  conversationId?: string,
): Promise<{ events: WireEvent[]; conversationId: string }> {
  const res = await postChat(app, cookie, {
    message,
    ...(conversationId ? { conversationId } : {}),
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");

  const events: WireEvent[] = [];
  let id = conversationId ?? "";
  for await (const frame of readSse(res)) {
    const event = JSON.parse(frame.data) as WireEvent;
    events.push(event);
    if (event.type === "conversation") id = String(event.conversationId);
    if (event.type === "approval_request") {
      const decision = await postDecision(app, cookie, id, decide(event));
      expect(decision.status).toBe(200);
    }
  }
  expect(id.length).toBeGreaterThan(0);
  return { events, conversationId: id };
}

function textOf(events: WireEvent[]): string {
  return events
    .filter((e) => e.type === "text")
    .map((e) => String(e.text))
    .join("");
}

function toolResults(events: WireEvent[]): WireEvent[] {
  return events.filter((e) => e.type === "tool_result");
}

describe("chat endpoints (fake provider)", () => {
  it("streams a full turn: approve the edit, reject the command, final answer", async () => {
    const { app, cookie, workspaceRoot, cleanup } = await fakeApp();
    try {
      const { events, conversationId } = await driveTurn(
        app,
        cookie,
        "Fix the notes file please",
        (approval) =>
          approval.name === "edit_file"
            ? { kind: "approve" }
            : { kind: "reject", note: "skip the command" },
      );

      // The stream opens with the conversation id.
      expect(events[0]).toMatchObject({ type: "conversation", conversationId });

      // Both risky tools asked for approval, in fixture order.
      const approvals = events.filter((e) => e.type === "approval_request");
      expect(approvals.map((e) => e.name)).toEqual(["edit_file", "execute_command"]);

      // The edit was approved and ran.
      const [editResult, commandResult] = toolResults(events);
      expect(editResult).toMatchObject({
        type: "tool_result",
        callId: "fake-edit",
      });
      expect(editResult?.isError).toBeUndefined();
      expect(String(editResult?.content)).toContain('Replaced 1 occurrence in "notes.txt"');

      // The command was rejected: it did not run and the note came back as the result.
      expect(commandResult).toMatchObject({
        type: "tool_result",
        callId: "fake-cmd",
        isError: true,
      });
      expect(String(commandResult?.content)).toContain("skip the command");

      // The model then produced the scripted final answer and ended the turn.
      expect(textOf(events)).toContain(FAKE_FINAL_TEXT);
      expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });

      // The approved edit really changed the seeded workspace.
      expect(await readFile(join(workspaceRoot, FAKE_NOTES_FILE), "utf8")).toContain(
        "hello, world",
      );
    } finally {
      await cleanup();
    }
  });

  it("forwards command stdout as command_output events before the result", async () => {
    const { app, cookie, cleanup } = await fakeApp();
    try {
      const { events } = await driveTurn(app, cookie, "Run it", () => ({ kind: "approve" }));

      const outputs = events.filter((e) => e.type === "command_output");
      expect(outputs.length).toBeGreaterThan(0);
      const stdout = outputs
        .filter((e) => e.stream === "stdout")
        .map((e) => String(e.text))
        .join("");
      expect(stdout).toContain("hello, world");

      const commandResult = toolResults(events).find((e) => e.callId === "fake-cmd");
      expect(commandResult?.isError).toBeUndefined();
      expect(String(commandResult?.content)).toContain("[exit code 0]");
    } finally {
      await cleanup();
    }
  });

  it("stops a slow-streaming turn and ends with a cancelled stop reason", async () => {
    const { app, cookie, cleanup } = await fakeApp(
      () => new FakeServerProvider({ turns: [FAKE_FIXTURE_TURNS[3]!] }),
    );
    try {
      const res = await postChat(app, cookie, { message: "stream something long" });
      expect(res.status).toBe(200);

      const events: WireEvent[] = [];
      let conversationId = "";
      let stopped = false;
      for await (const frame of readSse(res)) {
        const event = JSON.parse(frame.data) as WireEvent;
        events.push(event);
        if (event.type === "conversation") conversationId = String(event.conversationId);
        if (!stopped && event.type === "text" && conversationId !== "") {
          stopped = true;
          const stop = await app.request(`/api/chat/${conversationId}/stop`, {
            method: "POST",
            headers: { cookie },
          });
          expect(stop.status).toBe(200);
        }
      }

      expect(stopped).toBe(true);
      expect(events.some((e) => e.type === "state" && e.state === "cancelled")).toBe(true);
      expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "cancelled" });
    } finally {
      await cleanup();
    }
  });

  it("rejects API requests without the session token", async () => {
    const { app, cleanup } = await fakeApp();
    try {
      const res = await app.request("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hi" }),
      });
      expect(res.status).toBe(401);
    } finally {
      await cleanup();
    }
  });
});

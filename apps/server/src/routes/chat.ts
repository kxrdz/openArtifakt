import { Hono, type Context } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import { z } from "zod";

import {
  type AgentLoop,
  type ApprovalDecision,
  type ApprovalHandler,
  type ApprovalRequest,
  type ProviderAdapter,
  createProviderAdapter,
} from "@openartifact/core";

import { createAgentRuntime, defaultSnapshotRoot, toModelConfig } from "../agent/runtime";
import type { ActiveConfig, ServerConfig } from "../config";
import type { Repository } from "../db";
import { FakeServerProvider } from "../fake";
import { TurnPersistence } from "../persistence";

/**
 * Chat transport (§12.6, "Chat stream endpoint" / "Approval decision
 * round-trip" / "Stop" / "Command output streaming").
 *
 * Turns the engine into a usable chat server. `POST /api/chat` streams the
 * loop's events over SSE; an approval request pauses the loop until the client
 * submits a decision to `POST /api/chat/:conversationId/approval`; stop cancels
 * the in-flight turn. One {@link AgentLoop} owns each conversation's history,
 * so the registry maps a conversation id to its loop plus its pending
 * approval. Command stdout/stderr is forwarded as `command_output` events as it
 * arrives.
 */

/** The request body of `POST /api/chat`. */
const chatBodySchema = z.object({
  message: z.string().min(1),
  /** Continue an existing conversation; omitted creates a new one. */
  conversationId: z.string().min(1).optional(),
});

/** The decision body of `POST /api/chat/:conversationId/approval` (§8). */
export const approvalDecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approve") }),
  z.object({ kind: z.literal("edit-command"), command: z.string().min(1) }),
  z.object({ kind: z.literal("reject"), note: z.string() }),
]);

/** A pending approval the loop is currently blocked on. */
interface PendingApproval {
  request: ApprovalRequest;
  resolve: (decision: ApprovalDecision) => void;
  reject: (error: Error) => void;
}

/** One conversation: its agent loop, approval state and the active output sink. */
interface Conversation {
  id: string;
  loop: AgentLoop;
  providerId: string;
  /** True while a turn is in flight (rejects a concurrent second turn). */
  running: boolean;
  /** The approval the loop is awaiting, once registered. */
  pendingApproval: PendingApproval | null;
  /** A decision that arrived before the loop registered the pending approval. */
  pendingDecision: ApprovalDecision | null;
  /** The active SSE stream, for forwarding command output. */
  outputStream: SSEStreamingApi | null;
  /** Per-conversation turn counter; the next turn id is `turnCounter + 1`. */
  turnCounter: number;
}

/** Build an error the loop recognizes as an abort (see `AgentLoop.isAbortError`). */
function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

/** The provider for real mode: the adapter selected by the config. */
function realProviderFactory(config: ServerConfig): () => ProviderAdapter {
  return () => createProviderAdapter(toModelConfig(config));
}

/** The provider for a new conversation (fake replays a fresh fixture each time). */
function defaultProviderFactory(config: ServerConfig): () => ProviderAdapter {
  return config.fakeProvider ? () => new FakeServerProvider() : realProviderFactory(config);
}

/**
 * Build one conversation: a fresh provider, an {@link AgentLoop} wired to the
 * per-conversation approval seam, and command-output forwarding to the active
 * SSE stream.
 */
function buildConversation(
  id: string,
  config: ServerConfig,
  provider: ProviderAdapter,
  snapshotRoot: string,
): Conversation {
  const conversation: Conversation = {
    id,
    loop: undefined as unknown as AgentLoop,
    providerId: provider.id,
    running: false,
    pendingApproval: null,
    pendingDecision: null,
    outputStream: null,
    turnCounter: 0,
  };

  const approvalHandler: ApprovalHandler = (request, signal) =>
    new Promise<ApprovalDecision>((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError());
        return;
      }

      // A decision can arrive between the `approval_request` event and this
      // handler being called; consume it rather than waiting for another.
      if (conversation.pendingDecision !== null) {
        const decision = conversation.pendingDecision;
        conversation.pendingDecision = null;
        resolve(decision);
        return;
      }

      const clear = (): void => {
        if (conversation.pendingApproval?.request.callId === request.callId) {
          conversation.pendingApproval = null;
        }
      };
      const onAbort = (): void => {
        clear();
        reject(abortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });

      conversation.pendingApproval = {
        request,
        resolve: (decision) => {
          signal.removeEventListener("abort", onAbort);
          clear();
          resolve(decision);
        },
        reject: (error) => {
          signal.removeEventListener("abort", onAbort);
          clear();
          reject(error);
        },
      };
    });

  const runtime = createAgentRuntime({
    config,
    provider,
    approvalHandler,
    // Real snapshot location (§8 "Undo"): the turn id is set per `loop.run`.
    snapshot: { snapshotRoot, conversationId: id, turnId: "0" },
    onCommandOutput: (chunk, stream) => {
      const output = conversation.outputStream;
      if (output !== null && !output.closed && !output.aborted) {
        void output
          .writeSSE({
            event: "command_output",
            data: JSON.stringify({ type: "command_output", stream, text: chunk }),
          })
          .catch(() => {
            // The client disconnected mid-command; the loop abort handles cleanup.
          });
      }
    },
  });

  conversation.loop = runtime.loop;
  return conversation;
}

/** Write one loop/transport event as an SSE `event:`/`data:` frame. */
async function writeEvent<T extends { type: string }>(
  stream: SSEStreamingApi,
  event: T,
): Promise<void> {
  await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
}

/** In-memory registry of live conversations (persistence is a repository). */
export class ConversationRegistry {
  readonly #activeConfig: ActiveConfig;
  readonly #providerFactory: (() => ProviderAdapter) | undefined;
  readonly #snapshotRoot: string;
  readonly #conversations = new Map<string, Conversation>();
  #counter = 0;

  constructor(
    activeConfig: ActiveConfig,
    providerFactory?: () => ProviderAdapter,
    snapshotRoot: string = defaultSnapshotRoot(),
  ) {
    this.#activeConfig = activeConfig;
    this.#providerFactory = providerFactory;
    this.#snapshotRoot = snapshotRoot;
  }

  get(id: string): Conversation | undefined {
    return this.#conversations.get(id);
  }

  create(): Conversation {
    const id = `conv-${(this.#counter += 1)}-${Date.now().toString(36)}`;
    // Read the live config at creation time so a settings change applies to the
    // next conversation without a server restart (§12.8).
    const config = this.#activeConfig.get();
    const provider = this.#providerFactory
      ? this.#providerFactory()
      : defaultProviderFactory(config)();
    const conversation = buildConversation(id, config, provider, this.#snapshotRoot);
    this.#conversations.set(id, conversation);
    return conversation;
  }
}

/** Stream one user turn to completion, persisting it and forwarding every loop event. */
async function streamTurn(
  c: Context,
  conversation: Conversation,
  message: string,
  repository: Repository,
): Promise<Response> {
  conversation.running = true;
  // A disconnected client must abort the in-flight provider/tool work.
  c.req.raw.signal.addEventListener("abort", () => conversation.loop.cancel(), { once: true });

  return streamSSE(c, async (stream) => {
    conversation.outputStream = stream;
    stream.onAbort(() => conversation.loop.cancel());
    const persistence = new TurnPersistence(repository, conversation.id);
    try {
      persistence.beginTurn(message);
      await writeEvent(stream, { type: "conversation", conversationId: conversation.id });
      // One turn id per `loop.run` call, so this turn's snapshots land in their
      // own directory under `<snapshotRoot>/<conversation>/<turn>` (§8).
      conversation.turnCounter += 1;
      const turnId = String(conversation.turnCounter);
      for await (const event of conversation.loop.run(message, { turnId })) {
        if (stream.closed || stream.aborted) break;
        persistence.onEvent(event);
        await writeEvent(stream, event);
      }
    } catch (error) {
      if (!stream.closed && !stream.aborted) {
        await writeEvent(stream, {
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      persistence.finish();
      conversation.outputStream = null;
      conversation.running = false;
    }
  });
}

export interface ChatRoutesOptions {
  /** Live config; read when a conversation is created so settings apply live. */
  activeConfig: ActiveConfig;
  /** Persistence store; messages, tool calls and artifacts are written as they stream. */
  repository: Repository;
  /** Provider override (tests supply a tuned fake); defaults per `config.fakeProvider`. */
  providerFactory?: () => ProviderAdapter;
  /** Snapshot storage root for pre-mutation snapshots (§8); defaults to the home dir. */
  snapshotRoot?: string;
}

/** The chat routes: `/` (stream), `/:conversationId/approval` and `/:conversationId/stop`. */
export function createChatRouter(options: ChatRoutesOptions): Hono {
  const registry = new ConversationRegistry(
    options.activeConfig,
    options.providerFactory,
    options.snapshotRoot,
  );
  const router = new Hono();

  router.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = chatBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", issues: parsed.error.issues }, 400);
    }
    const { message, conversationId } = parsed.data;

    let conversation = conversationId === undefined ? undefined : registry.get(conversationId);
    if (conversationId !== undefined && conversation === undefined) {
      return c.json({ error: "Unknown conversation" }, 404);
    }
    conversation ??= registry.create();
    if (conversation.running) {
      return c.json({ error: "A turn is already running in this conversation" }, 409);
    }

    return streamTurn(c, conversation, message, options.repository);
  });

  router.post("/:conversationId/approval", async (c) => {
    const conversation = registry.get(c.req.param("conversationId"));
    if (conversation === undefined) {
      return c.json({ error: "Unknown conversation" }, 404);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = approvalDecisionSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid approval decision", issues: parsed.error.issues }, 400);
    }
    const decision = parsed.data;

    if (conversation.pendingApproval !== null) {
      conversation.pendingApproval.resolve(decision);
      return c.json({ ok: true });
    }
    if (conversation.pendingDecision !== null) {
      return c.json({ error: "An approval decision is already pending" }, 409);
    }
    // Buffer the decision: it raced ahead of the loop registering the pending
    // approval; the handler consumes it as soon as it is called.
    conversation.pendingDecision = decision;
    return c.json({ ok: true });
  });

  router.post("/:conversationId/stop", (c) => {
    const conversation = registry.get(c.req.param("conversationId"));
    if (conversation === undefined) {
      return c.json({ error: "Unknown conversation" }, 404);
    }
    conversation.loop.cancel();
    return c.json({ ok: true });
  });

  return router;
}

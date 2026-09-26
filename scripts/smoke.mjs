#!/usr/bin/env node
/**
 * Smoke test for the provider adapters (§4, `pnpm smoke`).
 *
 * Makes exactly one real streaming request through the adapter for a single
 * provider and prints the reply (or a clear `[skip]` line when the provider's
 * key is missing). It never prints keys or other secrets: the key is only ever
 * handed to the adapter as the auth header, and output is limited to the
 * provider id, the model, the received text, and the usage counters.
 *
 * Usage:
 *   pnpm smoke --provider <id>            # openai-compatible | anthropic | gemini | ollama | all
 *   pnpm smoke --provider <id> --model <m>        # override the default model
 *   pnpm smoke --provider <id> --base-url <url>   # override the default base URL
 *
 * Keys are read from `.env` at the repo root (loaded into the environment) or
 * from the environment directly. Per-provider defaults can also be overridden
 * with SMOKE_<ID>_MODEL and SMOKE_<ID>_BASE_URL, e.g.
 * SMOKE_OPENAI_COMPATIBLE_BASE_URL to point the openai-compatible adapter at
 * Groq, Together, DeepSeek, OpenRouter, vLLM, LM Studio or LocalAI.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createProviderAdapter } from "../packages/core/src/providers/factory.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PROMPT = "Reply with exactly the word 'pong' and nothing else.";
const REQUEST_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Provider registry: id -> smoke defaults (key ref, default model/base URL,
// capabilities, context window). Capabilities mirror each adapter's native
// behavior; the smoke request sends no tools, so only the text path matters.
// ---------------------------------------------------------------------------

const PROVIDERS = {
  "openai-compatible": {
    keyRef: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    defaultBaseUrl: "https://api.openai.com/v1",
    contextWindow: 128_000,
    capabilities: { nativeTools: true, streamingToolArgs: true, vision: false },
  },
  anthropic: {
    keyRef: "ANTHROPIC_API_KEY",
    defaultModel: "claude-3-5-haiku-latest",
    defaultBaseUrl: "https://api.anthropic.com",
    contextWindow: 200_000,
    capabilities: { nativeTools: true, streamingToolArgs: true, vision: true },
  },
  gemini: {
    keyRef: "GEMINI_API_KEY",
    defaultModel: "gemini-2.0-flash",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    contextWindow: 1_048_576,
    capabilities: { nativeTools: true, streamingToolArgs: false, vision: true },
  },
  ollama: {
    keyRef: null,
    defaultModel: "llama3.2",
    defaultBaseUrl: "http://127.0.0.1:11434",
    contextWindow: 8_192,
    capabilities: { nativeTools: true, streamingToolArgs: false, vision: false },
  },
};

const PROVIDER_IDS = Object.keys(PROVIDERS);

// ---------------------------------------------------------------------------
// .env loading (mirrors scripts/jev-review.mjs; values are never logged)
// ---------------------------------------------------------------------------

function loadDotEnv() {
  const path = resolve(ROOT, ".env");
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let candidate = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = candidate.indexOf("=");
    if (eq === -1) continue;
    const key = candidate.slice(0, eq).trim();
    let value = candidate.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage() {
  process.stdout.write(`Smoke test the provider adapters with one real request.

Usage:
  pnpm smoke --provider <id>                  ${PROVIDER_IDS.join(" | ")} | all
  pnpm smoke --provider <id> --model <m>      override the default model
  pnpm smoke --provider <id> --base-url <url> override the default base URL
  pnpm smoke --help                           show this help

A provider without a key is skipped with a clear message and exits 0.
`);
}

function parseArgs(argv) {
  const opts = { provider: null, model: null, baseUrl: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--provider") opts.provider = argv[++i] ?? null;
    else if (arg === "--model") opts.model = argv[++i] ?? null;
    else if (arg === "--base-url") opts.baseUrl = argv[++i] ?? null;
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n\n`);
      usage();
      process.exit(2);
    }
  }
  return opts;
}

function envOverride(id, kind) {
  const prefix = "SMOKE_" + id.toUpperCase().replace(/-/g, "_");
  return process.env[`${prefix}_${kind}`] || undefined;
}

// ---------------------------------------------------------------------------
// One request
// ---------------------------------------------------------------------------

async function runOne(id, opts) {
  const spec = PROVIDERS[id];

  // Resolve the secret (or the lack of one) and skip when a key is required
  // but absent.
  let apiKey;
  if (spec.keyRef) {
    apiKey = process.env[spec.keyRef];
    if (!apiKey) {
      process.stdout.write(
        `[skip] ${id}: ${spec.keyRef} is not set in .env or the environment. ` +
          `Set it to run a real request against ${id}.\n`,
      );
      return "skip";
    }
  }

  const model = opts.model ?? envOverride(id, "MODEL") ?? spec.defaultModel;
  const baseUrl = opts.baseUrl ?? envOverride(id, "BASE_URL") ?? spec.defaultBaseUrl;

  const config = {
    provider: id,
    model,
    baseUrl,
    ...(spec.keyRef ? { apiKeyRef: spec.keyRef } : {}),
    contextWindow: spec.contextWindow,
    capabilities: spec.capabilities,
    maxTokens: 64,
  };

  const request = {
    model,
    messages: [
      {
        id: "smoke-user-1",
        role: "user",
        parts: [{ type: "text", text: PROMPT }],
        createdAt: Date.now(),
      },
    ],
    maxTokens: 64,
  };

  process.stdout.write(`[run] ${id} (${model}): waiting for a response…\n`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let text = "";
  let usage = null;
  let stopReason = null;
  let error = null;

  try {
    const adapter = createProviderAdapter(config, { apiKey });
    for await (const event of adapter.stream(request, controller.signal)) {
      if (event.type === "text_delta") text += event.text;
      else if (event.type === "usage") usage = event;
      else if (event.type === "done") stopReason = event.stopReason;
      else if (event.type === "error") error = event.message;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timeout);
  }

  if (error) {
    process.stderr.write(`[error] ${id}: ${error}\n`);
    return "error";
  }

  const reply = text.trim();
  process.stdout.write(`[ok] ${id} (${model}): ${reply || "(no text)"}\n`);
  if (usage) {
    process.stdout.write(
      `[usage] ${id}: ${usage.inputTokens} input / ${usage.outputTokens} output tokens ` +
        `(stop: ${stopReason ?? "?"})\n`,
    );
  }
  return "ok";
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  loadDotEnv();
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.provider) {
    process.stderr.write("Missing required --provider <id>.\n\n");
    usage();
    process.exit(2);
  }

  const ids =
    opts.provider === "all" ? PROVIDER_IDS : opts.provider === "" ? [] : [opts.provider];
  if (ids.length === 0 || !ids.every((id) => PROVIDERS[id])) {
    process.stderr.write(
      `Unknown provider id "${opts.provider}" (expected one of: ${PROVIDER_IDS.join(", ")}, or all).\n`,
    );
    process.exit(2);
  }

  let failed = false;
  for (const id of ids) {
    const result = await runOne(id, opts);
    if (result === "error") failed = true;
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`[error] smoke: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

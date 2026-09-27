import { afterEach, describe, expect, it, vi } from "vitest";

import type { Settings } from "@openartifact/shared";

import { fetchSettings, saveSettings } from "./settings";

/** A complete, valid settings object for round-tripping. */
const settings: Settings = {
  provider: "openai-compatible",
  model: "example-model",
  baseUrl: "https://api.example.com/v1",
  apiKeyRef: "EXAMPLE_API_KEY",
  approvalMode: "ask",
  contextWindow: 128000,
  capabilities: { nativeTools: true, streamingToolArgs: true, vision: false },
};

const okResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(implementation: typeof fetch) {
  const mock = vi.fn(implementation);
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("settings client", () => {
  it("fetches and validates settings", async () => {
    stubFetch(() => Promise.resolve(okResponse(settings)));

    await expect(fetchSettings()).resolves.toEqual(settings);
  });

  it("rejects a settings payload that fails the schema", async () => {
    stubFetch(() =>
      Promise.resolve(
        okResponse({ ...settings, provider: "not-a-provider" }),
      ),
    );

    await expect(fetchSettings()).rejects.toThrow();
  });

  it("throws with the status when loading fails", async () => {
    stubFetch(() => Promise.resolve(new Response("nope", { status: 503 })));

    await expect(fetchSettings()).rejects.toThrow("503");
  });

  it("saves settings with PUT and returns the stored value", async () => {
    const fetchMock = stubFetch(
      ((input: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          expect(String(input)).toBe("/api/settings");
          expect(init?.method).toBe("PUT");
          expect(JSON.parse(String(init?.body))).toEqual(settings);
          resolve(okResponse(settings));
        })) as unknown as typeof fetch,
    );

    await expect(saveSettings(settings)).resolves.toEqual(settings);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("surfaces the server's error message when saving fails", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "Invalid settings" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(saveSettings(settings)).rejects.toThrow("Invalid settings");
  });

  it("falls back to the status code when the error body has no message", async () => {
    stubFetch(() => Promise.resolve(new Response("boom", { status: 500 })));

    await expect(saveSettings(settings)).rejects.toThrow("500");
  });
});

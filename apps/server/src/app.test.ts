import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { loadConfig } from "./config";

describe("server app", () => {
  it("responds to /health with ok", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, name: "open-artifact" });
  });

  it("serves vendored sandbox modules under /vendor with CORS", async () => {
    const app = createApp();
    const res = await app.request("/vendor/react.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("content-type")).toContain("text/javascript");
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    // A stable React export proves the bundle (not an empty/error page) was served.
    expect(body).toContain("useState");
  });

  it("rejects path traversal out of the vendor directory", async () => {
    const app = createApp();
    const res = await app.request("/vendor/..%2F..%2Fpackage.json");
    expect(res.status).toBe(404);
  });

  it("reports the provider readiness and workspace root on /api/session", async () => {
    const config = { ...loadConfig({}), provider: "ollama" as const, workspaceRoot: "/tmp/ws" };
    const app = createApp({ config });
    const res = await app.request("/api/session");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      provider: string;
      providerReady: boolean;
      workspaceRoot: string;
    };
    expect(body).toMatchObject({
      ok: true,
      provider: "ollama",
      providerReady: true,
      workspaceRoot: "/tmp/ws",
    });
  });

  it("reports a not-ready provider when the API key is missing", async () => {
    const config = { ...loadConfig({}), apiKeyRef: "MISSING_KEY" };
    const app = createApp({ config });
    const res = await app.request("/api/session");
    const body = (await res.json()) as { providerReady: boolean };
    expect(body.providerReady).toBe(false);
  });
});

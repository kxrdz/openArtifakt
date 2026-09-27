import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import {
  SESSION_COOKIE_NAME,
  generateSessionToken,
  isLoopbackHost,
  isLoopbackOrigin,
  loopbackGuard,
  sessionCookieValue,
  sessionTokenGuard,
} from "./security";

describe("session token", () => {
  it("generates a long, random token that differs between calls", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(b.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("emits an httpOnly, SameSite=Strict, root-path cookie", () => {
    const value = sessionCookieValue("abc123");
    expect(value).toContain(`${SESSION_COOKIE_NAME}=abc123`);
    expect(value).toContain("HttpOnly");
    expect(value).toContain("SameSite=Strict");
    expect(value).toContain("Path=/");
  });
});

describe("loopback host/origin predicates", () => {
  it("accepts loopback hosts with and without ports", () => {
    for (const host of [
      "127.0.0.1",
      "127.0.0.1:4318",
      "127.1.2.3",
      "localhost",
      "localhost:4318",
      "localhost.",
      "::1",
      "[::1]",
      "[::1]:4318",
      "LOCALHOST:4318",
    ]) {
      expect(isLoopbackHost(host), host).toBe(true);
    }
  });

  it("rejects non-loopback hosts", () => {
    for (const host of [
      "example.com",
      "example.com:4318",
      "192.168.1.1",
      "10.0.0.1",
      "[::2]",
      "127.0.0.1.evil.com",
      "0.0.0.0",
      "",
    ]) {
      expect(isLoopbackHost(host), host).toBe(false);
    }
  });

  it("accepts loopback origins and rejects foreign or malformed ones", () => {
    expect(isLoopbackOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isLoopbackOrigin("http://localhost:4318")).toBe(true);
    expect(isLoopbackOrigin("http://[::1]:4318")).toBe(true);
    expect(isLoopbackOrigin("https://127.0.0.1")).toBe(true);
    expect(isLoopbackOrigin("http://example.com")).toBe(false);
    expect(isLoopbackOrigin("not a url")).toBe(false);
  });
});

describe("guards (through a Hono app)", () => {
  function guardedApp() {
    const app = new Hono();
    app.use("/api/*", loopbackGuard());
    app.use("/api/*", sessionTokenGuard("secret-token"));
    app.get("/api/probe", (c) => c.json({ ok: true }));
    return app;
  }

  it("rejects a request without the session token", async () => {
    const res = await guardedApp().request("/api/probe");
    expect(res.status).toBe(401);
  });

  it("accepts a request carrying the correct token cookie", async () => {
    const res = await guardedApp().request("/api/probe", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=secret-token` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects a non-loopback Host", async () => {
    const res = await guardedApp().request("http://127.0.0.1/api/probe", {
      headers: { host: "evil.com", cookie: `${SESSION_COOKIE_NAME}=secret-token` },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a foreign Origin", async () => {
    const res = await guardedApp().request("/api/probe", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=secret-token`,
        origin: "http://evil.com",
      },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a wrong token even with a loopback Host", async () => {
    const res = await guardedApp().request("/api/probe", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=wrong-token` },
    });
    expect(res.status).toBe(401);
  });
});

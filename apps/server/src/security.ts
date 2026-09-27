import { randomBytes } from "node:crypto";

import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

/**
 * Local-server security (§9 "Local server").
 *
 * The server binds to loopback only, issues a random per-startup session token
 * to the UI as an httpOnly cookie, requires it on every API request, and
 * rejects requests whose `Host` or `Origin` is not the local UI — the
 * defenses against DNS rebinding and cross-site request forgery. This module
 * is pure Hono glue so the token, cookie and host/origin predicates are unit
 * tested without a running server.
 */

/** The session cookie name (documented; clients never read it — it is httpOnly). */
export const SESSION_COOKIE_NAME = "openartifact_session";

/** Generate a random per-startup session token (URL-safe, 256-bit). */
export function generateSessionToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** The `Set-Cookie` value issued to the UI: httpOnly, Strict same-site, root path. */
export function sessionCookieValue(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict`;
}

/**
 * Normalize a `Host` header value for comparison: lowercase, strip a trailing
 * dot and any port, and keep an IPv6 literal's brackets (so `[::1]` and
 * `[::1]:4318` both normalize to `[::1]`).
 */
function normalizeHost(raw: string): string {
  let host = raw.trim().toLowerCase();
  if (host === "") return host;
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(0, end + 1);
  }
  // Strip the port only when there is exactly one colon (hostname:port), so a
  // bare IPv6 literal such as `::1` is left intact.
  const colonCount = host.split(":").length - 1;
  if (colonCount === 1) host = host.slice(0, host.lastIndexOf(":"));
  return host;
}

/**
 * True when `host` is a loopback host. Accepts `localhost`, the IPv6 loopback
 * `::1`/`[::1]`, and any address in `127.0.0.0/8` (with or without a port).
 */
export function isLoopbackHost(host: string): boolean {
  const normalized = normalizeHost(host);
  if (normalized === "localhost" || normalized === "::1" || normalized === "[::1]") {
    return true;
  }
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized);
}

/** True when `origin` parses as a URL whose host is loopback. */
export function isLoopbackOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return isLoopbackHost(url.hostname);
}

/**
 * Reject requests whose `Host` is present but not loopback (DNS rebinding) and
 * whose `Origin` is present but not loopback (CSRF from another site). Absent
 * headers pass — the token guard below is the additional layer on API routes.
 */
export function loopbackGuard(): MiddlewareHandler {
  return async (c: Context, next) => {
    const host = c.req.header("host");
    if (host !== undefined && !isLoopbackHost(host)) {
      return c.json({ error: "Forbidden host" }, 403);
    }
    const origin = c.req.header("origin");
    if (origin !== undefined && origin !== "null" && !isLoopbackOrigin(origin)) {
      return c.json({ error: "Forbidden origin" }, 403);
    }
    await next();
  };
}

/** Require the session token cookie on every guarded request (§9). */
export function sessionTokenGuard(token: string): MiddlewareHandler {
  return async (c: Context, next) => {
    if (getCookie(c, SESSION_COOKIE_NAME) !== token) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  };
}

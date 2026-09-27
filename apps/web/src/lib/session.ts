/**
 * Session bootstrap (§12.6, design decision 4).
 *
 * The server issues a random per-startup session token as an httpOnly cookie
 * and requires it on every `/api/*` request (§9). The client calls the
 * token-exempt `GET /api/session` once on load so the browser stores the cookie
 * and the first chat request is authorized. The response also carries the
 * public config (approval mode, fake flag, provider); the settings drawer
 * (feature 8) consumes the rest of it.
 */

/** Public, non-secret info returned by `GET /api/session`. */
export interface SessionInfo {
  ok: boolean;
  approvalMode: string;
  fakeProvider: boolean;
  provider: string;
}

/**
 * Fetch the session cookie and public config once on startup. Never throws:
 * a failure is non-fatal — the server surfaces a clear error if a later
 * request is rejected for want of the cookie.
 */
export async function bootstrapSession(): Promise<SessionInfo | null> {
  try {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    if (!response.ok) return null;
    return (await response.json()) as SessionInfo;
  } catch {
    return null;
  }
}

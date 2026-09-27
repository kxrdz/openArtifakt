import { parseSettings, type Settings } from "@openartifact/shared";

/**
 * Settings client (§12.8, "Settings drawer").
 *
 * Talks to the server's settings API (`GET/PUT /api/settings`), validates the
 * responses against the shared wire schema, and surfaces clear failures.
 * Only the non-secret settings cross the wire: `apiKeyRef` is the *name* of
 * the environment variable holding the key — a key value is never sent to or
 * shown in the browser (§9).
 */

/** `GET /api/settings` — the persisted (or live) non-secret settings. */
export async function fetchSettings(signal?: AbortSignal): Promise<Settings> {
  const response = await fetch("/api/settings", {
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to load settings (${response.status})`);
  }
  return parseSettings((await response.json()) as unknown);
}

/** `PUT /api/settings` — persist and live-apply the non-secret settings. */
export async function saveSettings(
  settings: Settings,
  signal?: AbortSignal,
): Promise<Settings> {
  const response = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) {
    // Prefer the server's message ("what happened and what to do next") over
    // a bare status code when the body carries one.
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    if (body !== null && typeof body.error === "string" && body.error !== "") {
      throw new Error(body.error);
    }
    throw new Error(`Failed to save settings (${response.status})`);
  }
  return parseSettings((await response.json()) as unknown);
}

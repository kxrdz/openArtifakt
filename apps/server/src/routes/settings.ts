import { Hono } from "hono";

import { settingsSchema, type Settings } from "@openartifact/shared";

import type { ActiveConfig, ServerConfig } from "../config";
import type { Repository } from "../db";

/**
 * Settings API (§12.8, "Settings drawer").
 *
 * `GET /api/settings` returns the non-secret settings; `PUT /api/settings`
 * persists them and live-applies them to the active server configuration so
 * the next conversation uses the new provider, model, approval mode, context
 * window and capability flags — no restart required. API keys never appear
 * here: only `apiKeyRef`, the *name* of the env var holding the key (§9).
 */

/** The repository key the {@link Settings} object is stored under. */
export const SETTINGS_KEY = "settings";

/** Project the non-secret, editable fields of a config into the wire {@link Settings}. */
export function toSettings(config: ServerConfig): Settings {
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    apiKeyRef: config.apiKeyRef ?? null,
    approvalMode: config.approvalMode,
    contextWindow: config.contextWindow,
    capabilities: config.capabilities,
  };
}

/** Merge editable settings over a config, preserving workspace/fake-provider fields. */
export function applySettings(config: ServerConfig, settings: Settings): ServerConfig {
  return {
    ...config,
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    apiKeyRef: settings.apiKeyRef ?? undefined,
    approvalMode: settings.approvalMode,
    contextWindow: settings.contextWindow,
    capabilities: settings.capabilities,
  };
}

export interface SettingsRoutesOptions {
  /** The live config the settings routes read from and write back to. */
  activeConfig: ActiveConfig;
  /** Persistence store; settings survive a restart when backed by SQLite. */
  repository: Repository;
}

export function createSettingsRouter(options: SettingsRoutesOptions): Hono {
  const { activeConfig, repository } = options;
  const router = new Hono();

  router.get("/", (c) => {
    const persisted = repository.getSettings(SETTINGS_KEY);
    if (persisted !== null) {
      const parsed = settingsSchema.safeParse(persisted);
      if (parsed.success) return c.json(parsed.data);
      // A corrupt stored value falls through to the live config below.
    }
    return c.json(toSettings(activeConfig.get()));
  });

  router.put("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid settings", issues: parsed.error.issues }, 400);
    }

    const settings = parsed.data;
    // Only the key-reference *name* is ever persisted; never a key value (§9).
    repository.saveSettings(SETTINGS_KEY, settings);
    activeConfig.set(applySettings(activeConfig.get(), settings));
    return c.json(settings);
  });

  return router;
}

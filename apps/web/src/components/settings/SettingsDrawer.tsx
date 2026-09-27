import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  approvalModeSchema,
  providerIdSchema,
  type ApprovalMode,
  type ProviderCapabilities,
  type ProviderId,
  type Settings,
} from "@openartifact/shared";

import { fetchSessionInfo } from "../../lib/session";
import { fetchSettings, saveSettings } from "../../lib/settings";
import { Badge, Button, cn, Dialog, focusRing, IconButton, Spinner, XIcon } from "../ui";

/**
 * The settings drawer (§12.8): provider, model, base URL, API-key reference
 * (masked — a name, never the key), context window, capability flags and
 * approval mode. Settings persist server-side and apply live to subsequent
 * turns. The fake-provider replay flag is shown read-only (it is a server
 * start-up flag).
 *
 * Opened from the status bar; Escape, the scrim, a Close action or a
 * successful Save dismiss it.
 */

const PROVIDERS = providerIdSchema.options;
const APPROVAL_MODES = approvalModeSchema.options;

/** One line of calm, plain guidance per approval mode (PRODUCT.md voice). */
const approvalHelp: Record<ApprovalMode, string> = {
  ask: "Every risky action waits for your approval",
  "auto-edit": "File edits run automatically; commands still ask",
  "full-auto": "No approvals. Every tool runs immediately",
};

/** The three capability flags an adapter branches on (§4). */
const capabilityRows: Array<{
  key: keyof ProviderCapabilities;
  label: string;
  help: string;
}> = [
  {
    key: "nativeTools",
    label: "Native tool calling",
    help: "The model emits tool calls itself; otherwise a text protocol is used",
  },
  {
    key: "streamingToolArgs",
    label: "Streaming tool arguments",
    help: "Tool-call arguments arrive incrementally while the model works",
  },
  {
    key: "vision",
    label: "Vision",
    help: "The model accepts image input",
  },
];

/** Shared form-control styling: token-backed, consistent with the composer. */
const fieldClass = cn(
  "h-8 w-full rounded-md border border-border bg-bg-sunken px-2.5 text-sm text-text",
  focusRing,
);

const labelClass = "mb-1 block text-xs font-medium text-text-secondary";
const helpClass = "mt-1 block text-xs text-text-muted";

export interface SettingsDrawerProps {
  /** Dismisses the drawer (Escape, scrim, Close, or a successful Save). */
  onClose: () => void;
}

export function SettingsDrawer({ onClose }: SettingsDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [draft, setDraft] = useState<Settings | null>(null);
  const [fakeProvider, setFakeProvider] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load the persisted settings (and the read-only fake flag) on mount.
  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setSaveError(null);
    void fetchSettings(controller.signal)
      .then((settings) => {
        setDraft(settings);
        setLoadState("ready");
      })
      .catch(() => {
        // The error state renders the failure; a rejected fetch is expected.
        if (!controller.signal.aborted) setLoadState("error");
      });
    void fetchSessionInfo(controller.signal).then((info) => {
      if (info !== null) setFakeProvider(info.fakeProvider);
    });
    return () => controller.abort();
  }, []);

  // The shared Dialog primitive owns initial focus, the focus trap, Escape and
  // the scrim; closeRef is only passed in so focus starts on the Close control.

  function patch(changes: Partial<Settings>) {
    setDraft((current) => (current === null ? current : { ...current, ...changes }));
  }

  function toggleCapability(
    event: ChangeEvent<HTMLInputElement>,
    key: keyof ProviderCapabilities,
  ) {
    const { checked } = event.target;
    setDraft((current) =>
      current === null
        ? current
        : { ...current, capabilities: { ...current.capabilities, [key]: checked } },
    );
  }

  const canSave =
    draft !== null &&
    !saving &&
    draft.model.trim() !== "" &&
    draft.baseUrl.trim() !== "" &&
    Number.isInteger(draft.contextWindow) &&
    draft.contextWindow >= 1;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft === null || !canSave) return;
    setSaving(true);
    setSaveError(null);
    void saveSettings(draft)
      .then(() => {
        onClose();
      })
      .catch((error: unknown) => {
        setSaving(false);
        setSaveError(
          error instanceof Error ? error.message : "Failed to save settings",
        );
      });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      label="Settings"
      initialFocusRef={closeRef}
      className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <h2 className="text-sm font-semibold text-text">Settings</h2>
        <IconButton
          ref={closeRef}
          className="ml-auto"
          aria-label="Close settings"
          icon={<XIcon className="h-4 w-4" />}
          onClick={onClose}
        />
      </div>

        {loadState === "loading" ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-text-muted">
            <Spinner size="sm" />
            Loading
          </div>
        ) : loadState === "error" || draft === null ? (
          <div
            role="alert"
            className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <p className="text-sm text-text-secondary">
              Settings could not be loaded.
            </p>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              <label className="block">
                <span className={labelClass}>Provider</span>
                <select
                  name="provider"
                  className={fieldClass}
                  value={draft.provider}
                  onChange={(event) =>
                    patch({ provider: event.target.value as ProviderId })
                  }
                >
                  {PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className={labelClass}>Model</span>
                <input
                  type="text"
                  name="model"
                  className={fieldClass}
                  value={draft.model}
                  onChange={(event) => patch({ model: event.target.value })}
                />
              </label>

              <label className="block">
                <span className={labelClass}>Base URL</span>
                <input
                  type="text"
                  name="baseUrl"
                  className={fieldClass}
                  value={draft.baseUrl}
                  onChange={(event) => patch({ baseUrl: event.target.value })}
                />
              </label>

              <label className="block">
                <span className={labelClass}>API key reference</span>
                <input
                  type="password"
                  name="apiKeyRef"
                  autoComplete="off"
                  spellCheck={false}
                  className={fieldClass}
                  placeholder="No key required"
                  value={draft.apiKeyRef ?? ""}
                  onChange={(event) =>
                    patch({
                      apiKeyRef: event.target.value === "" ? null : event.target.value,
                    })
                  }
                />
                <span className={helpClass}>
                  Name of the environment variable that holds the key. The key
                  itself is never shown, sent to the browser or stored. Leave
                  empty for a local provider that needs no key.
                </span>
              </label>

              <label className="block">
                <span className={labelClass}>Context window</span>
                <input
                  type="number"
                  name="contextWindow"
                  min={1}
                  step={1}
                  className={fieldClass}
                  value={draft.contextWindow}
                  onChange={(event) =>
                    patch({ contextWindow: Number(event.target.value) })
                  }
                />
                <span className={helpClass}>
                  Model tokens; older turns are summarized above 75 % of this.
                </span>
              </label>

              <fieldset>
                <legend className={labelClass}>Provider capabilities</legend>
                <div className="space-y-2">
                  {capabilityRows.map((row) => (
                    <label
                      key={row.key}
                      className="flex cursor-pointer items-start gap-2.5"
                    >
                      <input
                        type="checkbox"
                        name={`capabilities.${row.key}`}
                        checked={draft.capabilities[row.key]}
                        onChange={(event) => toggleCapability(event, row.key)}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded-sm border border-border bg-bg-sunken accent-accent"
                      />
                      <span>
                        <span className="block text-sm text-text">{row.label}</span>
                        <span className={helpClass}>{row.help}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <span className={labelClass}>Approval mode</span>
                <select
                  name="approvalMode"
                  className={fieldClass}
                  value={draft.approvalMode}
                  onChange={(event) =>
                    patch({ approvalMode: event.target.value as ApprovalMode })
                  }
                >
                  {APPROVAL_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
                <span className={helpClass}>{approvalHelp[draft.approvalMode]}</span>
              </label>

              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-sunken px-3 py-2.5">
                <div>
                  <p className="text-sm text-text">Fake provider replay</p>
                  <p className={helpClass}>
                    Read-only. Set OPENARTIFACT_FAKE_PROVIDER=1 on the server.
                  </p>
                </div>
                <span data-testid="fake-provider">
                  <Badge tone={fakeProvider ? "warning" : "neutral"}>
                    {fakeProvider ? "On" : "Off"}
                  </Badge>
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border p-3">
              {saveError !== null && (
                <p role="alert" className="mr-auto text-sm text-danger">
                  {saveError}
                </p>
              )}
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button type="submit" variant="primary" disabled={!canSave} loading={saving}>
                Save
              </Button>
            </div>
          </form>
        )}
    </Dialog>
  );
}

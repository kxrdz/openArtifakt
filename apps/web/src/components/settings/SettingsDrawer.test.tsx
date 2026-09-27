// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Settings } from "@openartifact/shared";

import type { SessionInfo } from "../../lib/session";

// The drawer talks to the server through these clients; drive them directly.
vi.mock("../../lib/settings", () => ({
  fetchSettings: vi.fn(),
  saveSettings: vi.fn(),
}));
vi.mock("../../lib/session", () => ({
  fetchSessionInfo: vi.fn(),
}));

import { fetchSettings, saveSettings } from "../../lib/settings";
import { fetchSessionInfo } from "../../lib/session";
import { SettingsDrawer } from "./SettingsDrawer";

const settings: Settings = {
  provider: "openai-compatible",
  model: "example-model",
  baseUrl: "https://api.example.com/v1",
  apiKeyRef: "EXAMPLE_API_KEY",
  approvalMode: "ask",
  contextWindow: 128000,
  capabilities: { nativeTools: true, streamingToolArgs: false, vision: false },
};

const sessionInfo: SessionInfo = {
  ok: true,
  approvalMode: "ask",
  fakeProvider: false,
  provider: "openai-compatible",
};

const mockFetchSettings = vi.mocked(fetchSettings);
const mockSaveSettings = vi.mocked(saveSettings);
const mockFetchSessionInfo = vi.mocked(fetchSessionInfo);

beforeEach(() => {
  mockFetchSettings.mockResolvedValue(settings);
  mockSaveSettings.mockResolvedValue(settings);
  mockFetchSessionInfo.mockResolvedValue(sessionInfo);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Open the drawer and wait for the form to be ready. */
async function openDrawer(onClose = vi.fn()) {
  render(<SettingsDrawer onClose={onClose} />);
  await waitFor(() => {
    expect(
      document.querySelector('form select[name="provider"]'),
    ).not.toBeNull();
  });
  return onClose;
}

function field(name: string): HTMLInputElement | HTMLSelectElement {
  const element = document.querySelector(`form [name="${name}"]`);
  if (element === null) throw new Error(`Missing field: ${name}`);
  return element as HTMLInputElement | HTMLSelectElement;
}

describe("SettingsDrawer", () => {
  it("shows the current provider, model, base URL and approval mode", async () => {
    await openDrawer();

    expect((field("provider") as HTMLSelectElement).value).toBe(
      "openai-compatible",
    );
    expect((field("model") as HTMLInputElement).value).toBe("example-model");
    expect((field("baseUrl") as HTMLInputElement).value).toBe(
      "https://api.example.com/v1",
    );
    expect((field("approvalMode") as HTMLSelectElement).value).toBe("ask");
    expect((field("contextWindow") as HTMLInputElement).value).toBe("128000");
    expect((field("capabilities.nativeTools") as HTMLInputElement).checked).toBe(
      true,
    );
    expect(
      (field("capabilities.streamingToolArgs") as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("masks the API key reference (a name, never a key value)", async () => {
    await openDrawer();

    const keyRef = field("apiKeyRef") as HTMLInputElement;
    expect(keyRef.type).toBe("password");
    expect(keyRef.value).toBe("EXAMPLE_API_KEY");
  });

  it("shows the fake-provider flag read-only", async () => {
    mockFetchSessionInfo.mockResolvedValue({ ...sessionInfo, fakeProvider: true });

    await openDrawer();

    const badge = document.querySelector('[data-testid="fake-provider"]');
    expect(badge?.textContent).toContain("On");
    // It is a status readout, not an editable control.
    expect(document.querySelector('form [name="fakeProvider"]')).toBeNull();
  });

  it("saves edited settings and closes on success", async () => {
    const onClose = await openDrawer();

    fireEvent.change(field("model"), { target: { value: "other-model" } });
    fireEvent.change(field("approvalMode"), {
      target: { value: "auto-edit" },
    });
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalledOnce();
    });
    expect(mockSaveSettings.mock.calls[0]![0]).toEqual({
      ...settings,
      model: "other-model",
      approvalMode: "auto-edit",
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("sends a null key reference when the masked field is emptied", async () => {
    const onClose = await openDrawer();

    fireEvent.change(field("apiKeyRef"), { target: { value: "" } });
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalledOnce();
    });
    expect(mockSaveSettings.mock.calls[0]![0].apiKeyRef).toBeNull();
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("shows the server's error and stays open when saving fails", async () => {
    mockSaveSettings.mockRejectedValue(new Error("Invalid settings"));
    const onClose = await openDrawer();

    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => {
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "Invalid settings",
      );
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const onClose = await openDrawer();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes from the close action", async () => {
    const onClose = await openDrawer();

    const closeButton = document.querySelector(
      'button[aria-label="Close settings"]',
    );
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a load failure without a form", async () => {
    mockFetchSettings.mockRejectedValue(new Error("offline"));
    const onClose = vi.fn();
    render(<SettingsDrawer onClose={onClose} />);

    await waitFor(() => {
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "could not be loaded",
      );
    });
    expect(document.querySelector("form")).toBeNull();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The shell's children fetch on mount; drive those clients directly so the
// test exercises only the status-bar trigger -> drawer wiring.
vi.mock("../../lib/history", () => ({
  loadConversations: vi.fn().mockResolvedValue(undefined),
  restoreConversation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../lib/settings", () => ({
  fetchSettings: vi.fn(),
  saveSettings: vi.fn(),
}));
vi.mock("../../lib/session", () => ({
  bootstrapSession: vi.fn(),
  fetchSessionInfo: vi.fn(),
}));

import { fetchSettings } from "../../lib/settings";
import { fetchSessionInfo } from "../../lib/session";
import { WorkspaceShell } from "./WorkspaceShell";

const mockFetchSettings = vi.mocked(fetchSettings);
const mockFetchSessionInfo = vi.mocked(fetchSessionInfo);

beforeAll(() => {
  window.matchMedia = matchMediaStub;
  mockFetchSettings.mockResolvedValue({
    provider: "openai-compatible",
    model: "example-model",
    baseUrl: "https://api.example.com/v1",
    apiKeyRef: null,
    approvalMode: "ask",
    contextWindow: 128000,
    capabilities: { nativeTools: true, streamingToolArgs: false, vision: false },
  });
  mockFetchSessionInfo.mockResolvedValue(null);
});

// jsdom has no matchMedia implementation; stub it. `matches: false` keeps the
// shell on the narrow-screen path (no SplitPane/ResizeObserver).
const matchMediaStub = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

beforeAll(() => {
  window.matchMedia = matchMediaStub;
});

afterAll(() => {
  // jsdom leaves no matchMedia to restore; the stub simply goes away with it.
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("WorkspaceShell: settings drawer wiring", () => {
  it("opens the settings drawer from the status-bar settings control", async () => {
    render(<WorkspaceShell />);

    expect(document.querySelector('[role="dialog"]')).toBeNull();

    const trigger = document.querySelector('button[aria-label="Settings"]');
    expect(trigger).not.toBeNull();
    fireEvent.click(trigger!);

    await waitFor(() => {
      expect(
        document.querySelector('[role="dialog"][aria-label="Settings"]'),
      ).not.toBeNull();
    });
  });

  it("closes the drawer on Escape", async () => {
    render(<WorkspaceShell />);

    fireEvent.click(document.querySelector('button[aria-label="Settings"]')!);

    await waitFor(() => {
      expect(
        document.querySelector('[role="dialog"][aria-label="Settings"]'),
      ).not.toBeNull();
    });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
  });
});

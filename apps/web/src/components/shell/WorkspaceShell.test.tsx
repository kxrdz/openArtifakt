// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatStore } from "../../store/chatStore";

// The shell's children fetch on mount; drive those clients directly so the
// test exercises only the shortcut/status-bar wiring.
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

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  // A clean chat store for every test (the singleton is shared across tests).
  useChatStore.getState().reset();
  // Reset the session-info client so each test starts from "unknown" status.
  mockFetchSessionInfo.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

describe("WorkspaceShell: first-run and no-provider states", () => {
  it("shows the first-run hint and workspace root when a provider is ready", async () => {
    mockFetchSessionInfo.mockResolvedValue({
      ok: true,
      approvalMode: "ask",
      fakeProvider: false,
      provider: "openai-compatible",
      providerReady: true,
      workspaceRoot: "/tmp/project",
    });
    render(<WorkspaceShell />);

    await waitFor(() => {
      expect(screen.getByText("Ask about your project")).toBeTruthy();
    });
    expect(screen.getByText("Working in /tmp/project")).toBeTruthy();
  });

  it("shows a path into settings when no provider is ready", async () => {
    mockFetchSessionInfo.mockResolvedValue({
      ok: true,
      approvalMode: "ask",
      fakeProvider: false,
      provider: "openai-compatible",
      providerReady: false,
    });
    render(<WorkspaceShell />);

    await waitFor(() => {
      expect(screen.getByText("Add a provider to get started")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    await waitFor(() => {
      expect(
        document.querySelector('[role="dialog"][aria-label="Settings"]'),
      ).not.toBeNull();
    });
  });
});

describe("WorkspaceShell: global shortcuts", () => {
  it("opens settings with Mod+,", () => {
    render(<WorkspaceShell />);

    fireEvent.keyDown(window, { key: ",", metaKey: true });

    expect(
      document.querySelector('[role="dialog"][aria-label="Settings"]'),
    ).not.toBeNull();
  });

  it("opens and closes the artifact sheet with Mod+\\ and Escape on narrow screens", () => {
    render(<WorkspaceShell />);

    expect(document.querySelector('[role="dialog"]')).toBeNull();

    fireEvent.keyDown(window, { key: "\\", metaKey: true });

    const sheet = document.querySelector(
      '[role="dialog"][aria-label="Artifact panel"]',
    );
    expect(sheet).not.toBeNull();

    // The sheet captures Escape itself (global shortcuts are suppressed while
    // a modal is open), so Escape closes it.
    fireEvent.keyDown(
      document.querySelector('button[aria-label="Close artifact panel"]')!,
      { key: "Escape" },
    );

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("toggles the terminal log with Mod+J", () => {
    render(<WorkspaceShell />);

    const header = document.querySelector<HTMLButtonElement>(
      'section[aria-label="Terminal log"] button',
    );
    expect(header?.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(window, { key: "j", metaKey: true });
    expect(header?.getAttribute("aria-expanded")).toBe("false");

    fireEvent.keyDown(window, { key: "j", metaKey: true });
    expect(header?.getAttribute("aria-expanded")).toBe("true");
  });

  it("stops a running turn with Escape", () => {
    render(<WorkspaceShell />);

    act(() => {
      useChatStore.setState({ isSending: true, agentState: "streaming" });
    });
    const stop = vi.spyOn(useChatStore.getState(), "stop").mockImplementation(() => {});

    fireEvent.keyDown(window, { key: "Escape" });

    expect(stop).toHaveBeenCalledOnce();
  });

  it("approves the pending action with Alt+A", () => {
    render(<WorkspaceShell />);

    act(() => {
      useChatStore.setState({
        conversationId: "conv-1",
        isSending: true,
        agentState: "awaiting_approval",
        pendingApproval: {
          type: "approval_request",
          callId: "call-1",
          name: "edit_file",
          args: { path: "a.ts", oldString: "x", newString: "y" },
          reason: "Edits a file",
        },
      });
    });
    const decide = vi
      .spyOn(useChatStore.getState(), "decide")
      .mockImplementation(async () => {});

    fireEvent.keyDown(window, { key: "a", altKey: true });

    expect(decide).toHaveBeenCalledWith({ kind: "approve" });
  });

  it("rejects the pending action with Alt+R", () => {
    render(<WorkspaceShell />);

    act(() => {
      useChatStore.setState({
        conversationId: "conv-1",
        isSending: true,
        agentState: "awaiting_approval",
        pendingApproval: {
          type: "approval_request",
          callId: "call-1",
          name: "edit_file",
          args: { path: "a.ts", oldString: "x", newString: "y" },
          reason: "Edits a file",
        },
      });
    });
    const decide = vi
      .spyOn(useChatStore.getState(), "decide")
      .mockImplementation(async () => {});

    fireEvent.keyDown(window, { key: "r", altKey: true });

    expect(decide).toHaveBeenCalledWith({ kind: "reject", note: "" });
  });

  it("sends the composer draft with Mod+Enter", () => {
    useChatStore.getState().reset();
    const send = vi
      .spyOn(useChatStore.getState(), "send")
      .mockImplementation(async () => {});

    render(<WorkspaceShell />);

    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Message OpenArtifact"]',
    );
    expect(textarea).not.toBeNull();
    fireEvent.change(textarea!, { target: { value: "hello" } });

    fireEvent.keyDown(window, { key: "Enter", metaKey: true });

    expect(send).toHaveBeenCalledWith("hello");
  });

  it("renders Kbd hints on the shortcut-bearing controls", () => {
    render(<WorkspaceShell />);

    const sendButton = document.querySelector('button[type="submit"]');
    expect(sendButton?.querySelector("kbd")).not.toBeNull();

    const terminalHeader = document.querySelector<HTMLButtonElement>(
      'section[aria-label="Terminal log"] button',
    );
    expect(terminalHeader?.querySelector("kbd")).not.toBeNull();

    const settings = document.querySelector('button[aria-label="Settings"]');
    expect(settings?.getAttribute("title")).toContain("Ctrl+,");
  });
});

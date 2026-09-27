import { describe, expect, it, vi } from "vitest";

import {
  buildCommands,
  isEditableSafeShortcut,
  matchesShortcut,
  modKeyLabel,
  shortcutKeyLabels,
  type CommandActions,
  type Shortcut,
  type ShortcutEvent,
} from "./commands";

function event(overrides: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return {
    key: "",
    code: undefined,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("matchesShortcut", () => {
  it("treats mod as Meta or Ctrl, matching either", () => {
    const shortcut: Shortcut = { mod: true, key: "k" };
    expect(matchesShortcut(event({ key: "k", metaKey: true }), shortcut)).toBe(
      true,
    );
    expect(matchesShortcut(event({ key: "k", ctrlKey: true }), shortcut)).toBe(
      true,
    );
  });

  it("rejects a mod shortcut when no mod is held", () => {
    expect(
      matchesShortcut(event({ key: "k" }), { mod: true, key: "k" }),
    ).toBe(false);
  });

  it("requires mod to be absent for a non-mod shortcut", () => {
    const shortcut: Shortcut = { key: "Escape" };
    expect(matchesShortcut(event({ key: "Escape" }), shortcut)).toBe(true);
    expect(
      matchesShortcut(event({ key: "Escape", metaKey: true }), shortcut),
    ).toBe(false);
  });

  it("matches Alt+letter via the physical code on macOS composition", () => {
    // Option+A on macOS reports the composed character as `key` but keeps the
    // physical `code`, so the shortcut still matches.
    const shortcut: Shortcut = { alt: true, key: "a" };
    expect(
      matchesShortcut(event({ key: "å", code: "KeyA", altKey: true }), shortcut),
    ).toBe(true);
    expect(
      matchesShortcut(event({ key: "a", code: "KeyA", altKey: true }), shortcut),
    ).toBe(true);
  });

  it("requires alt and shift to match exactly", () => {
    expect(
      matchesShortcut(event({ key: "a", altKey: true }), { alt: true, key: "a" }),
    ).toBe(true);
    expect(
      matchesShortcut(event({ key: "a" }), { alt: true, key: "a" }),
    ).toBe(false);
    expect(
      matchesShortcut(event({ key: "a", shiftKey: true }), { key: "a" }),
    ).toBe(false);
  });

  it("matches special keys by their DOM key value", () => {
    expect(matchesShortcut(event({ key: "," }), { mod: true, key: "," })).toBe(
      false,
    );
    expect(
      matchesShortcut(event({ key: ",", metaKey: true }), { mod: true, key: "," }),
    ).toBe(true);
    expect(
      matchesShortcut(event({ key: "\\" }), { mod: true, key: "\\" }),
    ).toBe(false);
    expect(
      matchesShortcut(event({ key: "\\", ctrlKey: true }), {
        mod: true,
        key: "\\",
      }),
    ).toBe(true);
  });
});

describe("isEditableSafeShortcut", () => {
  it("allows Escape and Mod+K only", () => {
    expect(isEditableSafeShortcut({ key: "Escape" })).toBe(true);
    expect(isEditableSafeShortcut({ mod: true, key: "k" })).toBe(true);
  });

  it("blocks workflow shortcuts that would fire mid-typing", () => {
    expect(isEditableSafeShortcut({ mod: true, key: "Enter" })).toBe(false);
    expect(isEditableSafeShortcut({ alt: true, key: "a" })).toBe(false);
    expect(isEditableSafeShortcut({ alt: true, key: "r" })).toBe(false);
    expect(isEditableSafeShortcut({ mod: true, key: "i" })).toBe(false);
    expect(isEditableSafeShortcut({ mod: true, key: "," })).toBe(false);
  });
});

describe("shortcut labels", () => {
  it("labels mod as ⌘ on macOS and Ctrl elsewhere", () => {
    expect(modKeyLabel(true)).toBe("⌘");
    expect(modKeyLabel(false)).toBe("Ctrl");
  });

  it("renders keycaps in press order", () => {
    expect(shortcutKeyLabels({ mod: true, key: "k" }, false)).toEqual([
      "Ctrl",
      "K",
    ]);
    expect(shortcutKeyLabels({ mod: true, key: "k" }, true)).toEqual([
      "⌘",
      "K",
    ]);
    expect(shortcutKeyLabels({ alt: true, key: "a" }, true)).toEqual([
      "⌥",
      "A",
    ]);
    expect(shortcutKeyLabels({ key: "Escape" }, false)).toEqual(["Esc"]);
  });

  it("returns no keycaps for an unbound command", () => {
    expect(shortcutKeyLabels(undefined, false)).toEqual([]);
  });
});

/** A full action set with a `noop` for every command. */
function actions(overrides: Partial<CommandActions> = {}): CommandActions {
  return {
    send: () => undefined,
    stop: () => undefined,
    approve: () => undefined,
    reject: () => undefined,
    toggleArtifactPanel: () => undefined,
    toggleTerminalLog: () => undefined,
    openSettings: () => undefined,
    toggleTheme: () => undefined,
    newConversation: () => undefined,
    undoLastTurn: () => undefined,
    focusChatInput: () => undefined,
    jumpToArtifactPanel: () => undefined,
    ...overrides,
  };
}

describe("buildCommands", () => {
  const available = { sending: false, hasApproval: false, hasUndoableTurn: false };

  it("binds the default shortcut map", () => {
    const byId = new Map(
      buildCommands(actions(), available).map((command) => [command.id, command]),
    );
    expect(byId.get("send")?.shortcut).toEqual({ mod: true, key: "Enter" });
    expect(byId.get("stop")?.shortcut).toEqual({ key: "Escape" });
    expect(byId.get("approve")?.shortcut).toEqual({ alt: true, key: "a" });
    expect(byId.get("reject")?.shortcut).toEqual({ alt: true, key: "r" });
    expect(byId.get("toggle-artifact-panel")?.shortcut).toEqual({ mod: true, key: "\\" });
    expect(byId.get("toggle-terminal-log")?.shortcut).toEqual({ mod: true, key: "j" });
    expect(byId.get("open-settings")?.shortcut).toEqual({ mod: true, key: "," });
    expect(byId.get("focus-chat-input")?.shortcut).toEqual({ mod: true, key: "i" });
  });

  it("lists palette-only commands without a shortcut", () => {
    const byId = new Map(
      buildCommands(actions(), available).map((command) => [command.id, command]),
    );
    expect(byId.get("toggle-theme")?.shortcut).toBeUndefined();
    expect(byId.get("new-conversation")?.shortcut).toBeUndefined();
    expect(byId.get("undo-last-turn")?.shortcut).toBeUndefined();
    expect(byId.get("jump-to-artifact-panel")?.shortcut).toBeUndefined();
  });

  it("marks approve/reject as reachable inside editable fields while pending", () => {
    const byId = new Map(
      buildCommands(actions(), available).map((command) => [command.id, command]),
    );
    expect(byId.get("approve")?.allowInEditable).toBe(true);
    expect(byId.get("reject")?.allowInEditable).toBe(true);
    expect(byId.get("send")?.allowInEditable).toBeUndefined();
    expect(byId.get("stop")?.allowInEditable).toBeUndefined();
    expect(byId.get("toggle-artifact-panel")?.allowInEditable).toBeUndefined();
  });

  it("gates the conditional commands on availability", () => {
    const byId = new Map(
      buildCommands(actions(), {
        sending: true,
        hasApproval: true,
        hasUndoableTurn: true,
      }).map((command) => [command.id, command]),
    );
    expect(byId.get("send")?.when?.()).toBe(false);
    expect(byId.get("stop")?.when?.()).toBe(true);
    expect(byId.get("approve")?.when?.()).toBe(true);
    expect(byId.get("reject")?.when?.()).toBe(true);
    expect(byId.get("undo-last-turn")?.when?.()).toBe(true);
    expect(byId.get("toggle-artifact-panel")?.when).toBeUndefined();
  });

  it("runs the bound action", () => {
    const send = vi.fn();
    const commands = buildCommands(actions({ send }), available);
    commands.find((command) => command.id === "send")!.run();
    expect(send).toHaveBeenCalledOnce();
  });
});

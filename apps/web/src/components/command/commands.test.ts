import { describe, expect, it } from "vitest";

import {
  isEditableSafeShortcut,
  matchesShortcut,
  modKeyLabel,
  shortcutKeyLabels,
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

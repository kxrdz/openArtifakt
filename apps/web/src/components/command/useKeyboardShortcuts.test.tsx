// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import type { Command } from "./commands";

/** Render the hook with a command list so tests can drive window keydown. */
function Harness({ commands }: { commands: Command[] }) {
  useKeyboardShortcuts(commands);
  return null;
}

/** Dispatch a cancelable, bubbling keydown at `target`. */
function pressKey(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useKeyboardShortcuts", () => {
  it("fires a command whose shortcut matches", () => {
    const run = vi.fn();
    render(
      <Harness
        commands={[{ id: "palette", label: "Command palette", shortcut: { mod: true, key: "k" }, run }]}
      />,
    );

    pressKey(window, { key: "k", metaKey: true });

    expect(run).toHaveBeenCalledOnce();
  });

  it("treats Ctrl as Mod too, on any platform", () => {
    const run = vi.fn();
    render(
      <Harness
        commands={[{ id: "palette", label: "Command palette", shortcut: { mod: true, key: "k" }, run }]}
      />,
    );

    pressKey(window, { key: "k", ctrlKey: true });

    expect(run).toHaveBeenCalledOnce();
  });

  it("calls preventDefault on handled bindings", () => {
    render(
      <Harness
        commands={[{ id: "settings", label: "Settings", shortcut: { mod: true, key: "," }, run: vi.fn() }]}
      />,
    );

    const event = pressKey(window, { key: ",", metaKey: true });

    expect(event.defaultPrevented).toBe(true);
  });

  it("does not preventDefault when nothing matches", () => {
    render(
      <Harness
        commands={[{ id: "settings", label: "Settings", shortcut: { mod: true, key: "," }, run: vi.fn() }]}
      />,
    );

    const event = pressKey(window, { key: "x" });

    expect(event.defaultPrevented).toBe(false);
  });

  it("honours a command's when predicate", () => {
    const run = vi.fn();
    render(
      <Harness
        commands={[
          {
            id: "approve",
            label: "Approve",
            shortcut: { alt: true, key: "a" },
            run,
            when: () => false,
          },
        ]}
      />,
    );

    pressKey(window, { key: "a", altKey: true });

    expect(run).not.toHaveBeenCalled();
  });

  it("ignores workflow shortcuts while focus is inside a text field", () => {
    const run = vi.fn();
    const { container } = render(
      <div>
        <Harness
          commands={[
            { id: "approve", label: "Approve", shortcut: { alt: true, key: "a" }, run },
          ]}
        />
        <input aria-label="composer" />
      </div>,
    );

    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    input!.focus();
    pressKey(input!, { key: "a", altKey: true });

    expect(run).not.toHaveBeenCalled();
  });

  it("still fires Escape inside a text field", () => {
    const run = vi.fn();
    const { container } = render(
      <div>
        <Harness
          commands={[{ id: "stop", label: "Stop", shortcut: { key: "Escape" }, run }]}
        />
        <input aria-label="composer" />
      </div>,
    );

    const input = container.querySelector("input");
    input!.focus();
    pressKey(input!, { key: "Escape" });

    expect(run).toHaveBeenCalledOnce();
  });

  it("still fires Mod+K inside a text field", () => {
    const run = vi.fn();
    const { container } = render(
      <div>
        <Harness
          commands={[
            { id: "palette", label: "Command palette", shortcut: { mod: true, key: "k" }, run },
          ]}
        />
        <input aria-label="composer" />
      </div>,
    );

    const input = container.querySelector("input");
    input!.focus();
    pressKey(input!, { key: "k", metaKey: true });

    expect(run).toHaveBeenCalledOnce();
  });

  it("runs only the first matching command", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <Harness
        commands={[
          { id: "one", label: "One", shortcut: { mod: true, key: "k" }, run: first },
          { id: "two", label: "Two", shortcut: { mod: true, key: "k" }, run: second },
        ]}
      />,
    );

    pressKey(window, { key: "k", metaKey: true });

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it("skips commands without a shortcut", () => {
    const run = vi.fn();
    render(
      <Harness commands={[{ id: "jump", label: "Jump to artifact", run }]} />,
    );

    pressKey(window, { key: "k", metaKey: true });

    expect(run).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandPalette, filterCommands, fuzzyMatch } from "./CommandPalette";
import type { Command } from "./commands";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeCommands(): { commands: Command[]; runs: Record<string, () => void> } {
  const runs = {
    new: vi.fn(),
    settings: vi.fn(),
    theme: vi.fn(),
    focus: vi.fn(),
    panel: vi.fn(),
  };
  const commands: Command[] = [
    { id: "new", label: "New conversation", run: runs.new },
    {
      id: "settings",
      label: "Open settings",
      hint: "preferences",
      shortcut: { mod: true, key: "," },
      run: runs.settings,
    },
    { id: "theme", label: "Toggle theme", run: runs.theme },
    {
      id: "focus",
      label: "Focus chat input",
      shortcut: { mod: true, key: "i" },
      run: runs.focus,
    },
    {
      id: "panel",
      label: "Toggle artifact panel",
      shortcut: { mod: true, key: "\\" },
      run: runs.panel,
    },
  ];
  return { commands, runs };
}

/** Open the palette via the Mod+K window keydown, as a user would. */
function openPalette() {
  fireEvent.keyDown(window, { key: "k", metaKey: true });
}

function searchInput(): HTMLInputElement {
  return screen.getByRole("combobox") as HTMLInputElement;
}

describe("fuzzyMatch", () => {
  it("matches a case-insensitive subsequence", () => {
    expect(fuzzyMatch("Open settings", "set")).toBe(true);
    expect(fuzzyMatch("Open settings", "OS")).toBe(true);
    expect(fuzzyMatch("Open settings", "toggle")).toBe(false);
  });

  it("matches the empty query", () => {
    expect(fuzzyMatch("anything", "")).toBe(true);
  });
});

describe("filterCommands", () => {
  const commands: Command[] = [
    { id: "a", label: "Open settings", run: vi.fn() },
    { id: "b", label: "Toggle theme", hint: "light dark", run: vi.fn() },
    { id: "c", label: "Hidden command", run: vi.fn(), when: () => false },
  ];

  it("returns all available commands for an empty query", () => {
    expect(filterCommands(commands, "").map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("filters by label and hint keywords", () => {
    expect(filterCommands(commands, "dark").map((c) => c.id)).toEqual(["b"]);
    expect(filterCommands(commands, "set").map((c) => c.id)).toEqual(["a"]);
  });

  it("hides unavailable commands regardless of query", () => {
    expect(filterCommands(commands, "hidden").map((c) => c.id)).toEqual([]);
  });
});

describe("CommandPalette", () => {
  it("opens on Mod+K and closes on Escape", () => {
    render(<CommandPalette commands={makeCommands().commands} />);

    expect(screen.queryByRole("dialog")).toBeNull();

    openPalette();
    expect(screen.getByRole("dialog", { name: "Command palette" })).not.toBeNull();
    expect(document.activeElement).toBe(searchInput());

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("treats Ctrl+K as Mod too", () => {
    render(<CommandPalette commands={makeCommands().commands} />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("filters commands as the user types", () => {
    render(<CommandPalette commands={makeCommands().commands} />);
    openPalette();

    expect(screen.getAllByRole("option")).toHaveLength(5);

    fireEvent.change(searchInput(), { target: { value: "theme" } });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]!.textContent).toContain("Toggle theme");
  });

  it("shows an empty state when nothing matches", () => {
    render(<CommandPalette commands={makeCommands().commands} />);
    openPalette();

    fireEvent.change(searchInput(), { target: { value: "zzzz" } });

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No matching commands")).not.toBeNull();
  });

  it("navigates with the arrow keys and marks the active item", () => {
    render(<CommandPalette commands={makeCommands().commands} />);
    openPalette();

    const input = searchInput();
    expect(screen.getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe(
      "true",
    );

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(options[0]!.getAttribute("aria-selected")).toBe("false");
    expect(options[1]!.getAttribute("aria-selected")).toBe("true");

    // Wraps from the first item back to the last.
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(options[options.length - 1]!.getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("runs the active command on Enter and closes", () => {
    const { commands, runs } = makeCommands();
    render(<CommandPalette commands={commands} />);
    openPalette();

    // "New conversation" is active by default.
    fireEvent.keyDown(searchInput(), { key: "Enter" });

    expect(runs.new).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("runs the filtered command when a query narrows the list", () => {
    const { commands, runs } = makeCommands();
    render(<CommandPalette commands={commands} />);
    openPalette();

    fireEvent.change(searchInput(), { target: { value: "settings" } });
    fireEvent.keyDown(searchInput(), { key: "Enter" });

    expect(runs.settings).toHaveBeenCalledOnce();
  });

  it("runs a command on click", () => {
    const { commands, runs } = makeCommands();
    render(<CommandPalette commands={commands} />);
    openPalette();

    fireEvent.click(screen.getAllByRole("option")[2]!);

    expect(runs.theme).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("notifies onOpenChange and onRun", () => {
    const { commands, runs } = makeCommands();
    const onOpenChange = vi.fn();
    const onRun = vi.fn();
    render(
      <CommandPalette
        commands={commands}
        onOpenChange={onOpenChange}
        onRun={onRun}
      />,
    );

    openPalette();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.keyDown(searchInput(), { key: "Enter" });
    expect(onRun).toHaveBeenCalledWith(commands[0]);
    expect(runs.new).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("shows the shortcut keycap on a bound command", () => {
    render(<CommandPalette commands={makeCommands().commands} />);
    openPalette();

    const settings = screen
      .getAllByRole("option")
      .find((option) => option.textContent?.includes("Open settings"));
    expect(settings).not.toBeUndefined();
    expect(settings!.querySelector("kbd")).not.toBeNull();
  });
});

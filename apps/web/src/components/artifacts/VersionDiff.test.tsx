// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactVersion } from "../../artifacts";
import { VersionDiff } from "./VersionDiff";

/**
 * Task 7.2: the VersionDiff component. Monaco is browser-only and heavy, so
 * `./monacoSetup` (the lazily-imported editor module) is mocked with a stub
 * that records the models and editors it is asked to create — the selection
 * rules themselves are covered by versionDiff.test.ts.
 */

/** A recorded model: remembers its content and language. */
interface StubModel {
  content: string;
  language: string;
  dispose: ReturnType<typeof vi.fn>;
}

const { applyDiffEditorTheme, createDiffEditor, createModel, disposeEditor, setModel } =
  vi.hoisted(() => ({
    applyDiffEditorTheme: vi.fn(),
    createDiffEditor: vi.fn(),
    createModel: vi.fn(),
    disposeEditor: vi.fn(),
    setModel: vi.fn(),
  }));

vi.mock("./monacoSetup", () => ({
  DIFF_EDITOR_THEME: "openartifact-diff",
  applyDiffEditorTheme: (...args: unknown[]) => applyDiffEditorTheme(...args),
  monaco: {
    editor: {
      defineTheme: vi.fn(),
      setTheme: vi.fn(),
      createModel: (content: string, language?: string) =>
        createModel(content, language),
      createDiffEditor: (element: HTMLElement, options: unknown) =>
        createDiffEditor(element, options),
    },
  },
}));

beforeEach(() => {
  createModel.mockImplementation(
    (content: string, language = "plaintext"): StubModel => ({
      content,
      language,
      dispose: vi.fn(),
    }),
  );
  createDiffEditor.mockImplementation(() => ({ setModel, dispose: disposeEditor }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Three complete versions of a code artifact. */
function threeVersions(): ArtifactVersion[] {
  return [
    { version: 1, content: "print('one')", incomplete: false },
    { version: 2, content: "print('two')", incomplete: false },
    { version: 3, content: "print('three')", incomplete: false },
  ];
}

/** The model pair handed to the diff editor, newest call last. */
function lastModels(): { original: StubModel; modified: StubModel } {
  const calls = setModel.mock.calls as unknown as [
    { original: StubModel; modified: StubModel },
  ][];
  const last = calls[calls.length - 1];
  if (last === undefined) throw new Error("no setModel call recorded");
  return last[0];
}

describe("VersionDiff", () => {
  it("diffs the two latest versions by default and identifies both", async () => {
    render(
      <VersionDiff versions={threeVersions()} language="python" title="Script" />,
    );

    const older = screen.getByRole("combobox", {
      name: "Older version of Script",
    }) as HTMLSelectElement;
    const newer = screen.getByRole("combobox", {
      name: "Newer version of Script",
    }) as HTMLSelectElement;
    expect(older.value).toBe("2");
    expect(newer.value).toBe("3");

    // Every version is listed, newest last, latest marked.
    const options = Array.from(newer.options).map((option) => option.text);
    expect(options).toEqual(["v1", "v2", "v3 (latest)"]);

    // Monaco loaded and received the selected pair's contents.
    await waitFor(() => expect(setModel).toHaveBeenCalled());
    expect(createModel).toHaveBeenCalledWith("print('two')", "python");
    expect(createModel).toHaveBeenCalledWith("print('three')", "python");
    expect(lastModels().original.content).toBe("print('two')");
    expect(lastModels().modified.content).toBe("print('three')");
  });

  it("seeds the pair from a preferred (pinned) version", async () => {
    render(
      <VersionDiff
        versions={threeVersions()}
        language="python"
        title="Script"
        preferredVersion={1}
      />,
    );

    const older = screen.getByRole("combobox", {
      name: "Older version of Script",
    }) as HTMLSelectElement;
    expect(older.value).toBe("1");

    await waitFor(() => expect(setModel).toHaveBeenCalled());
    expect(lastModels().original.content).toBe("print('one')");
  });

  it("diffs a re-picked version pair", async () => {
    render(
      <VersionDiff versions={threeVersions()} language="python" title="Script" />,
    );

    await waitFor(() => expect(setModel).toHaveBeenCalled());

    const older = screen.getByRole("combobox", {
      name: "Older version of Script",
    }) as HTMLSelectElement;
    fireEvent.change(older, { target: { value: "1" } });
    expect(older.value).toBe("1");

    await waitFor(() =>
      expect(lastModels().original.content).toBe("print('one')"),
    );
    expect(lastModels().modified.content).toBe("print('three')");
  });

  it("nudges the other side when both selects would show the same version", async () => {
    render(
      <VersionDiff versions={threeVersions()} language="python" title="Script" />,
    );

    await waitFor(() => expect(setModel).toHaveBeenCalled());

    // Pick v3 on the older side, which the newer side already shows: the
    // newer side moves to the newest remaining older version (v2).
    const older = screen.getByRole("combobox", {
      name: "Older version of Script",
    }) as HTMLSelectElement;
    fireEvent.change(older, { target: { value: "3" } });
    expect(older.value).toBe("2");

    const newer = screen.getByRole("combobox", {
      name: "Newer version of Script",
    }) as HTMLSelectElement;
    expect(newer.value).toBe("3");
  });

  it("keeps a valid pair when a new version streams in", async () => {
    const { rerender } = render(
      <VersionDiff versions={threeVersions()} language="python" title="Script" />,
    );
    await waitFor(() => expect(setModel).toHaveBeenCalled());
    setModel.mockClear();

    const appended: ArtifactVersion[] = [
      ...threeVersions(),
      { version: 4, content: "print('four')", incomplete: false },
    ];
    rerender(
      <VersionDiff versions={appended} language="python" title="Script" />,
    );

    // The explicit pair (2 → 3) survives: it does not jump to 3 → 4, and no
    // new models are built for unchanged contents.
    const older = screen.getByRole("combobox", {
      name: "Older version of Script",
    }) as HTMLSelectElement;
    const newer = screen.getByRole("combobox", {
      name: "Newer version of Script",
    }) as HTMLSelectElement;
    expect(older.value).toBe("2");
    expect(newer.value).toBe("3");
    expect(setModel).not.toHaveBeenCalled();
  });

  it("shows an inline message when the editor fails to load", async () => {
    createDiffEditor.mockImplementation(() => {
      throw new Error("no monaco");
    });

    render(
      <VersionDiff versions={threeVersions()} language="python" title="Script" />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/diff editor could not be loaded/i),
      ).toBeTruthy(),
    );
  });
});

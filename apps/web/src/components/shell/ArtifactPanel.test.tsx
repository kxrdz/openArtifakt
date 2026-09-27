// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useArtifactStore } from "../../artifacts";
import type { Artifact } from "../../artifacts";
import { ArtifactPanel } from "./ArtifactPanel";

/** Stub for the lazily-loaded Monaco diff view (the real one is browser-only). */
vi.mock("../artifacts/VersionDiff", () => ({
  VersionDiff: (props: { versions: { version: number }[] }) => (
    <div
      data-testid="version-diff"
      data-versions={props.versions.map((version) => version.version).join(",")}
    />
  ),
}));

/**
 * Task 7.1: the version dropdown selects any stored version and the panel
 * renders that version's content, with the version number and a "latest"
 * marker. The store singleton is driven directly (the panel reads it); the
 * copy button of the Code viewer is the deterministic window onto exactly
 * which version's content is rendered.
 */

/** A code artifact with three complete versions. */
function threeVersionArtifact(): Artifact {
  return {
    identifier: "script",
    title: "Script",
    artifactType: "application/vnd.code",
    language: "python",
    incomplete: false,
    versions: [
      { version: 1, content: "print('version one')", incomplete: false },
      { version: 2, content: "print('version two')", incomplete: false },
      { version: 3, content: "print('version three')", incomplete: false },
    ],
  };
}

/** Install a mock Clipboard API and return its `writeText` spy. */
function mockClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

afterEach(() => {
  cleanup();
  useArtifactStore.getState().clear();
  vi.restoreAllMocks();
});

/** A code artifact with a single complete version. */
function singleVersionArtifact(): Artifact {
  return {
    identifier: "solo",
    title: "Solo",
    artifactType: "application/vnd.code",
    language: "python",
    incomplete: false,
    versions: [{ version: 1, content: "print('only')", incomplete: false }],
  };
}

describe("ArtifactPanel: diff tab", () => {
  it("opens the diff view for an artifact with multiple versions", () => {
    useArtifactStore.getState().restoreArtifacts([threeVersionArtifact()]);
    render(<ArtifactPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Diff" }));
    const diff = screen.getByTestId("version-diff");
    expect(diff.getAttribute("data-versions")).toBe("1,2,3");
  });

  it("disables the diff tab until a second version exists", () => {
    useArtifactStore.getState().restoreArtifacts([singleVersionArtifact()]);
    render(<ArtifactPanel />);

    const diffButton = screen.getByRole("button", {
      name: "Diff",
    }) as HTMLButtonElement;
    expect(diffButton.disabled).toBe(true);
  });
});

describe("ArtifactPanel: version dropdown", () => {
  it("follows the latest version by default and marks it in the dropdown", () => {
    const writeText = mockClipboard();
    useArtifactStore.getState().restoreArtifacts([threeVersionArtifact()]);
    render(<ArtifactPanel />);

    const dropdown = screen.getByRole("combobox", {
      name: "Version of Script",
    }) as HTMLSelectElement;
    expect(dropdown.value).toBe("3");

    // Every stored version is listed, newest last, latest marked.
    const options = Array.from(dropdown.options).map((option) => option.text);
    expect(options).toEqual(["v1", "v2", "v3 (latest)"]);

    // The rendered content is the latest version's.
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("print('version three')");
  });

  it("renders the selected older version without removing the newer ones", () => {
    const writeText = mockClipboard();
    useArtifactStore.getState().restoreArtifacts([threeVersionArtifact()]);
    render(<ArtifactPanel />);

    const dropdown = screen.getByRole("combobox", {
      name: "Version of Script",
    }) as HTMLSelectElement;
    fireEvent.change(dropdown, { target: { value: "1" } });

    // The older version is what renders now.
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("print('version one')");

    // The panel says an older version is open, and the newer versions stay.
    expect(screen.getByText("Viewing older version")).toBeTruthy();
    const options = Array.from(dropdown.options).map((option) => option.text);
    expect(options).toEqual(["v1", "v2", "v3 (latest)"]);
  });

  it("returns to the latest version when it is re-selected", () => {
    const writeText = mockClipboard();
    useArtifactStore.getState().restoreArtifacts([threeVersionArtifact()]);
    render(<ArtifactPanel />);

    const dropdown = screen.getByRole("combobox", {
      name: "Version of Script",
    }) as HTMLSelectElement;
    fireEvent.change(dropdown, { target: { value: "2" } });
    fireEvent.change(dropdown, { target: { value: "3" } });

    expect(dropdown.value).toBe("3");
    expect(screen.queryByText("Viewing older version")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("print('version three')");
  });
});

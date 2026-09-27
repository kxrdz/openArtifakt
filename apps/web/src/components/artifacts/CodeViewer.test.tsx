// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodeViewer } from "./CodeViewer";

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
  vi.restoreAllMocks();
});

describe("CodeViewer", () => {
  it("copies the raw source when the copy button is activated", () => {
    const writeText = mockClipboard();
    render(<CodeViewer code="const x: number = 1;" language="tsx" />);

    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    // The raw source is copied verbatim, never the highlighted HTML.
    expect(writeText).toHaveBeenCalledWith("const x: number = 1;");
  });

  it("renders the source without crashing for an unknown language", async () => {
    render(<CodeViewer code="def hello():\n  return 1" language="not-a-real-lang" />);

    // The highlighter falls back to plain text; the raw source must appear in
    // the document (as text) and the copy control must stay available.
    await waitFor(() => {
      expect(document.body.textContent).toContain("def hello()");
    });
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderMermaid } from "../artifacts/mermaid";
import { useArtifactStore } from "../../artifacts";

vi.mock("../artifacts/mermaid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../artifacts/mermaid")>();
  return { ...actual, renderMermaid: vi.fn() };
});

import { InlineMermaid } from "./InlineMermaid";

const mockedRenderMermaid = vi.mocked(renderMermaid);

beforeEach(() => {
  mockedRenderMermaid.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("InlineMermaid", () => {
  it("renders a complete diagram only after the 300 ms debounce", async () => {
    mockedRenderMermaid.mockResolvedValue('<svg data-rendered="true">diagram</svg>');

    render(<InlineMermaid source={"graph TD\n  A --> B"} />);

    // Before the debounce elapses the source is shown, not a partial render.
    expect(mockedRenderMermaid).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-label="Mermaid diagram"]')).toBeNull();
    expect(document.body.textContent).toContain("graph TD");

    await waitFor(() =>
      expect(document.querySelector('[aria-label="Mermaid diagram"]')).not.toBeNull(),
    );

    expect(mockedRenderMermaid).toHaveBeenCalledWith("graph TD\n  A --> B", expect.any(String));
    expect(document.querySelector('[aria-label="Mermaid diagram"]')?.innerHTML).toContain(
      "data-rendered",
    );
  });

  it("shows the source with the offending line when the diagram fails to parse", async () => {
    mockedRenderMermaid.mockRejectedValue(new Error("Parse error on line 2: bad token"));

    render(<InlineMermaid source={"graph TD\n  A -->\n  B --> C"} />);

    await waitFor(() =>
      expect(document.querySelector('[data-offending="true"]')).not.toBeNull(),
    );

    // The error message and source are shown; the message list never crashes.
    expect(document.body.textContent).toContain("Parse error on line 2");
    expect(document.body.textContent).toContain("graph TD");
    expect(document.querySelector('[data-offending="true"]')?.textContent).toContain("A -->");
  });

  it("lifts the source into the artifact panel via Open in panel", () => {
    const liftSpy = vi
      .spyOn(useArtifactStore.getState(), "liftToArtifact")
      .mockImplementation(() => {});

    render(<InlineMermaid source={"graph TD\n  A --> B"} title="Flow" />);
    fireEvent.click(screen.getByRole("button", { name: "Open in panel" }));

    expect(liftSpy).toHaveBeenCalledWith("graph TD\n  A --> B", "Flow");

    liftSpy.mockRestore();
  });
});

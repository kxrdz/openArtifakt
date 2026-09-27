// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MermaidError } from "./MermaidViewer";

afterEach(() => {
  cleanup();
});

describe("MermaidError", () => {
  it("shows the error message, the source, and highlights the offending line", () => {
    const source = "graph TD\n  A -->\n  B --> C";
    render(<MermaidError source={source} message="Parse error on line 2" line={2} />);

    // The message is shown above the source.
    expect(document.body.textContent).toContain("Parse error on line 2");

    // Every source line is present, with line numbers.
    expect(document.body.textContent).toContain("graph TD");
    expect(document.body.textContent).toContain("B --> C");

    // The offending line is flagged and highlighted for the user.
    const offending = document.querySelector('[data-offending="true"]');
    expect(offending).not.toBeNull();
    expect(offending?.textContent).toContain("A -->");
  });

  it("renders the source without a highlighted line when the line is unknown", () => {
    render(<MermaidError source="graph TD\n  A --> B" message="bad diagram" />);

    expect(document.body.textContent).toContain("bad diagram");
    expect(document.body.textContent).toContain("A --> B");
    expect(document.querySelector('[data-offending="true"]')).toBeNull();
  });
});

// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "../../store/chatStore";

// Keep the inline renderer out of these tests: MessageItem decides *when* to
// render it (complete fence) versus keeping a still-open fence literal.
vi.mock("./InlineMermaid", () => ({
  InlineMermaid: ({ source }: { source: string }) =>
    createElement("div", { "data-testid": "inline-mermaid", "data-source": source }),
}));

import { MessageItem } from "./MessageItem";

function assistantMessage(content: string): ChatMessage {
  return { id: "a1", role: "assistant", content, toolCalls: [], createdAt: 0 };
}

afterEach(() => {
  cleanup();
});

describe("MessageItem: parsed assistant content", () => {
  it("renders prose text blocks verbatim", () => {
    render(<MessageItem message={assistantMessage("Hello\nworld")} />);

    expect(document.body.textContent).toContain("Hello\nworld");
  });

  it("renders a complete mermaid fence as an inline diagram", () => {
    render(
      <MessageItem
        message={assistantMessage("Before\n```mermaid\ngraph TD\n  A --> B\n```\nAfter")}
      />,
    );

    const diagram = document.querySelector('[data-testid="inline-mermaid"]');
    expect(diagram).not.toBeNull();
    expect(diagram?.getAttribute("data-source")).toBe("graph TD\n  A --> B\n");
    // Prose still renders around the diagram.
    expect(document.body.textContent).toContain("Before");
    expect(document.body.textContent).toContain("After");
  });

  it("keeps a still-open mermaid fence literal instead of rendering a diagram", () => {
    render(<MessageItem message={assistantMessage("```mermaid\ngraph TD\n  A --> B")} />);

    expect(document.querySelector('[data-testid="inline-mermaid"]')).toBeNull();
    // The literal fence marker is shown, not consumed by a diagram.
    expect(document.body.textContent).toContain("```mermaid");
    expect(document.body.textContent).toContain("graph TD");
  });

  it("lifts artifact content out of the message", () => {
    render(
      <MessageItem
        message={assistantMessage(
          "Intro\n<artifact identifier=\"counter\" type=\"application/vnd.react\" title=\"Counter\">\nconst x = 1;\n</artifact>",
        )}
      />,
    );

    // Prose is shown; the artifact tags and body are not in the message.
    expect(document.body.textContent).toContain("Intro");
    expect(document.body.textContent).not.toContain("<artifact");
    expect(document.body.textContent).not.toContain("const x = 1");
  });
});

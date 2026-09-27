// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "../../store/chatStore";
import { useChatStore } from "../../store/chatStore";

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

/** An assistant message whose turn edited a file (undoable when completed). */
function editingMessage(): ChatMessage {
  return {
    id: "a2",
    role: "assistant",
    content: "I edited the file.",
    toolCalls: [
      {
        callId: "call-1",
        name: "edit_file",
        args: { path: "notes.txt", oldString: "a", newString: "b" },
        status: "done",
        result: "Replaced 1 occurrence",
        isError: false,
        decision: { kind: "approve" },
      },
    ],
    createdAt: 0,
  };
}

/** The real undo action, captured so tests can stub and restore it. */
const realUndoTurn = useChatStore.getState().undoTurn;

afterEach(() => {
  useChatStore.setState({ undoTurn: realUndoTurn });
  cleanup();
});

describe("MessageItem: parsed assistant content", () => {
  it("renders prose text blocks verbatim", () => {
    render(<MessageItem message={assistantMessage("Hello\nworld")} turn={1} inFlight={false} />);

    expect(document.body.textContent).toContain("Hello\nworld");
  });

  it("renders a complete mermaid fence as an inline diagram", () => {
    render(
      <MessageItem
        message={assistantMessage("Before\n```mermaid\ngraph TD\n  A --> B\n```\nAfter")}
        turn={1}
        inFlight={false}
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
    render(
      <MessageItem
        message={assistantMessage("```mermaid\ngraph TD\n  A --> B")}
        turn={1}
        inFlight={false}
      />,
    );

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
        turn={1}
        inFlight={false}
      />,
    );

    // Prose is shown; the artifact tags and body are not in the message.
    expect(document.body.textContent).toContain("Intro");
    expect(document.body.textContent).not.toContain("<artifact");
    expect(document.body.textContent).not.toContain("const x = 1");
  });
});

describe("MessageItem: undo this turn", () => {
  it("offers undo for a completed turn that changed files", () => {
    render(<MessageItem message={editingMessage()} turn={2} inFlight={false} />);

    const button = document.querySelector('button[type="button"]');
    expect(button?.textContent).toContain("Undo this turn");
  });

  it("hides undo while the turn is still streaming", () => {
    render(<MessageItem message={editingMessage()} turn={2} inFlight />);

    expect(document.body.textContent).not.toContain("Undo this turn");
  });

  it("hides undo for a turn that did not change files", () => {
    render(
      <MessageItem message={assistantMessage("Just prose.")} turn={2} inFlight={false} />,
    );

    expect(document.body.textContent).not.toContain("Undo this turn");
  });

  it("wires undo to the endpoint and reports the outcome", async () => {
    const undoTurn = vi.fn(async () => ({
      ok: true as const,
      turnId: "2",
      restored: ["notes.txt"],
      deleted: [],
    }));
    useChatStore.setState({ undoTurn });

    render(<MessageItem message={editingMessage()} turn={2} inFlight={false} />);
    fireEvent.click(document.querySelector('button[type="button"]')!);

    await waitFor(() => {
      expect(undoTurn).toHaveBeenCalledWith(2);
      expect(document.body.textContent).toContain("Undone — restored notes.txt.");
    });
  });

  it("shows the server's message when undo fails", async () => {
    useChatStore.setState({
      undoTurn: vi.fn(async () => {
        throw new Error("No snapshots to undo for this conversation");
      }),
    });

    render(<MessageItem message={editingMessage()} turn={1} inFlight={false} />);
    fireEvent.click(document.querySelector('button[type="button"]')!);

    await waitFor(() => {
      expect(document.body.textContent).toContain(
        "No snapshots to undo for this conversation",
      );
    });
  });
});

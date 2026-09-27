// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ToolCallState } from "../../store/chatStore";
import { ToolCallCard } from "./ToolCallCard";

afterEach(cleanup);

function toolCall(result: string): ToolCallState {
  return {
    callId: "call-1",
    name: "execute_command",
    args: { command: "pnpm test" },
    status: "done",
    result,
    isError: false,
  };
}

/** A result above the 4000-char clamp whose unique middle is cut by the
 * head/tail truncation, so it is absent until the block is expanded. */
function hugeResult(): string {
  return "A".repeat(2500) + "UNIQUE-MIDDLE-SENTINEL" + "B".repeat(2500);
}

function clickByText(text: string): void {
  const button = [...document.querySelectorAll("button")].find(
    (element) => element.textContent === text,
  );
  expect(button, `button "${text}"`).toBeDefined();
  fireEvent.click(button!);
}

describe("ToolCallCard: clamped tool output (§12.9 harden)", () => {
  it("truncates a huge result with a visible marker and a toggle", () => {
    render(<ToolCallCard toolCall={toolCall(hugeResult())} />);

    expect(document.body.textContent).toContain("Result truncated.");
    expect(document.body.textContent).toContain("content truncated");
    expect(document.body.textContent).toContain("Show more");
    // The middle beyond the head/tail clamp is not shown until expanded.
    expect(document.body.textContent).not.toContain("UNIQUE-MIDDLE-SENTINEL");
  });

  it("expands to the full result and collapses back", () => {
    render(<ToolCallCard toolCall={toolCall(hugeResult())} />);

    clickByText("Show more");

    expect(document.body.textContent).toContain("UNIQUE-MIDDLE-SENTINEL");
    expect(document.body.textContent).toContain("Show less");

    clickByText("Show less");

    expect(document.body.textContent).not.toContain("UNIQUE-MIDDLE-SENTINEL");
  });

  it("shows no toggle for a short result", () => {
    render(<ToolCallCard toolCall={toolCall("ok")} />);

    expect(document.body.textContent).not.toContain("Show more");
    expect(document.body.textContent).not.toContain("Result truncated.");
  });
});

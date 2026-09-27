// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "./Dialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Render an open dialog with a given number of focusable buttons inside. */
function renderOpen(onClose = vi.fn(), count = 2) {
  render(
    <Dialog open onClose={onClose} label="Test dialog">
      {Array.from({ length: count }, (_, i) => (
        <button key={i} type="button">
          Button {i}
        </button>
      ))}
    </Dialog>,
  );
  return onClose;
}

describe("Dialog", () => {
  it("renders an accessible modal when open and nothing when closed", () => {
    const { rerender } = render(
      <Dialog open={false} onClose={vi.fn()} label="Test dialog">
        <button type="button">Inside</button>
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <Dialog open onClose={vi.fn()} label="Test dialog">
        <button type="button">Inside</button>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("moves focus to the first focusable element on open", () => {
    renderOpen();

    expect(document.activeElement).toBe(screen.getByText("Button 0"));
  });

  it("honours an explicit initialFocusRef over the first focusable", () => {
    const ref = { current: null as HTMLElement | null };
    render(
      <Dialog
        open
        onClose={vi.fn()}
        label="Test dialog"
        initialFocusRef={ref}
      >
        <button type="button">First</button>
        <button
          type="button"
          ref={(el) => {
            ref.current = el;
          }}
        >
          Target
        </button>
      </Dialog>,
    );

    expect(document.activeElement).toBe(screen.getByText("Target"));
  });

  it("restores focus to the previously focused element on close", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <div>
        <button type="button">Outside</button>
        <Dialog open={false} onClose={onClose} label="Test dialog">
          <button type="button">Inside</button>
        </Dialog>
      </div>,
    );

    const outside = screen.getByText("Outside");
    outside.focus();

    rerender(
      <div>
        <button type="button">Outside</button>
        <Dialog open onClose={onClose} label="Test dialog">
          <button type="button">Inside</button>
        </Dialog>
      </div>,
    );
    expect(document.activeElement).toBe(screen.getByText("Inside"));

    rerender(
      <div>
        <button type="button">Outside</button>
        <Dialog open={false} onClose={onClose} label="Test dialog">
          <button type="button">Inside</button>
        </Dialog>
      </div>,
    );
    expect(document.activeElement).toBe(outside);
  });

  it("traps focus: Tab on the last element wraps to the first", () => {
    renderOpen();

    const last = screen.getByText("Button 1");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });

    expect(document.activeElement).toBe(screen.getByText("Button 0"));
  });

  it("traps focus: Shift+Tab on the first element wraps to the last", () => {
    renderOpen();

    const first = screen.getByText("Button 0");
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(screen.getByText("Button 1"));
  });

  it("closes on Escape", () => {
    const onClose = renderOpen();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when the scrim is clicked", () => {
    const onClose = renderOpen();

    const scrim = document.querySelector('[aria-hidden="true"]');
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim!);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps focus on the panel when there are no focusable children", () => {
    render(
      <Dialog open onClose={vi.fn()} label="Empty dialog">
        <p>Nothing to tab to</p>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(document, { key: "Tab" });

    expect(document.activeElement).toBe(dialog);
  });
});

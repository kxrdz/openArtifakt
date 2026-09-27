import { useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { cn } from "../ui";

/** Minimum useful width for each pane, in px (still usable on a 1440 screen). */
const MIN_LEFT = 360;
const MIN_RIGHT = 320;
/** Pixels the divider moves per Left/Right arrow key press. */
const KEYBOARD_STEP = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  className?: string;
}

/**
 * A two-pane, drag-to-resize split with a keyboard-operable divider.
 *
 * The left track width is React state driven by pointer events on the divider
 * (`role="separator"`, `aria-orientation="vertical"`), and by arrow/Home/End
 * keys. A ResizeObserver clamps the width when the container shrinks. No
 * resize-panel library: one divider does not justify the surface area.
 */
export function SplitPane({ left, right, className }: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const initializedRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [leftWidth, setLeftWidth] = useState(MIN_LEFT);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(Math.round(width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (containerWidth <= 0) return;
    const max = Math.max(MIN_LEFT, containerWidth - MIN_RIGHT);
    setLeftWidth((width) => {
      // First measure: default to a 45/55 split, then keep the user's width.
      if (!initializedRef.current) {
        initializedRef.current = true;
        return clamp(Math.round(containerWidth * 0.45), MIN_LEFT, max);
      }
      return clamp(width, MIN_LEFT, max);
    });
  }, [containerWidth]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!containerRef.current) return;
    dragRef.current = { startX: event.clientX, startWidth: leftWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !containerRef.current) return;
    const max = containerRef.current.clientWidth - MIN_RIGHT;
    setLeftWidth(
      clamp(
        dragRef.current.startWidth + (event.clientX - dragRef.current.startX),
        MIN_LEFT,
        max,
      ),
    );
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!containerRef.current) return;
    const max = containerRef.current.clientWidth - MIN_RIGHT;

    if (event.key === "Home") {
      event.preventDefault();
      setLeftWidth(MIN_LEFT);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setLeftWidth(max);
      return;
    }

    const step =
      event.key === "ArrowLeft"
        ? -KEYBOARD_STEP
        : event.key === "ArrowRight"
          ? KEYBOARD_STEP
          : null;
    if (step === null) return;

    event.preventDefault();
    setLeftWidth(clamp(leftWidth + step, MIN_LEFT, max));
  }

  const maxWidth =
    containerWidth > 0 ? Math.max(MIN_LEFT, containerWidth - MIN_RIGHT) : MIN_LEFT;

  return (
    <div
      ref={containerRef}
      className={cn("flex min-h-0 min-w-0 flex-1", dragging && "select-none", className)}
    >
      <div
        className="flex min-h-0 min-w-0 flex-col"
        style={{ width: leftWidth, flexShrink: 0 }}
      >
        {left}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat and artifact panels"
        aria-valuenow={Math.round(leftWidth)}
        aria-valuemin={MIN_LEFT}
        aria-valuemax={maxWidth}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="group relative w-1.5 shrink-0 cursor-col-resize touch-none before:absolute before:inset-y-0 before:-left-2.5 before:-right-2.5 focus-ring"
      >
        <span
          className={cn(
            "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors duration-fast",
            dragging ? "bg-accent" : "group-hover:bg-accent",
          )}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{right}</div>
    </div>
  );
}

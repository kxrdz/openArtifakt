import { describe, expect, it } from "vitest";

import { IdenticalFailureTracker, stableStringify } from "./identical-failure";

describe("stableStringify", () => {
  it("is order-independent for object keys", () => {
    const a = { command: "pnpm test", cwd: "src" };
    const b = { cwd: "src", command: "pnpm test" };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("distinguishes structurally different values", () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(null)).toBe("null");
  });

  it("sorts nested object keys", () => {
    const a = { nested: { x: 1, y: 2 } };
    const b = { nested: { y: 2, x: 1 } };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });
});

describe("IdenticalFailureTracker", () => {
  it("does not stop before the threshold is reached", () => {
    const tracker = new IdenticalFailureTracker(3);
    expect(tracker.record("edit_file", { path: "a.ts" }, true)).toBe(false);
    expect(tracker.record("edit_file", { path: "a.ts" }, true)).toBe(false);
  });

  it("stops when the same call fails three times", () => {
    const tracker = new IdenticalFailureTracker(3);
    tracker.record("edit_file", { path: "a.ts" }, true);
    tracker.record("edit_file", { path: "a.ts" }, true);
    expect(tracker.record("edit_file", { path: "a.ts" }, true)).toBe(true);
  });

  it("treats differently-ordered args as identical", () => {
    const tracker = new IdenticalFailureTracker(2);
    tracker.record("execute_command", { command: "x", cwd: "y" }, true);
    expect(tracker.record("execute_command", { cwd: "y", command: "x" }, true)).toBe(true);
  });

  it("keeps different arguments independent", () => {
    const tracker = new IdenticalFailureTracker(2);
    tracker.record("read_file", { path: "a.ts" }, true);
    expect(tracker.record("read_file", { path: "b.ts" }, true)).toBe(false);
  });

  it("keeps different tools independent", () => {
    const tracker = new IdenticalFailureTracker(2);
    tracker.record("edit_file", { path: "a.ts" }, true);
    expect(tracker.record("write_file", { path: "a.ts" }, true)).toBe(false);
  });

  it("clears the count on a success", () => {
    const tracker = new IdenticalFailureTracker(2);
    tracker.record("edit_file", { path: "a.ts" }, true);
    tracker.record("edit_file", { path: "a.ts" }, false);
    expect(tracker.record("edit_file", { path: "a.ts" }, true)).toBe(false);
  });

  it("exposes the current count and resets", () => {
    const tracker = new IdenticalFailureTracker(3);
    tracker.record("edit_file", { path: "a.ts" }, true);
    tracker.record("edit_file", { path: "a.ts" }, true);
    expect(tracker.count("edit_file", { path: "a.ts" })).toBe(2);
    tracker.reset();
    expect(tracker.count("edit_file", { path: "a.ts" })).toBe(0);
  });
});

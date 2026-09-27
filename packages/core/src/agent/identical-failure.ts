import { DEFAULT_AGENT_LOOP_LIMITS } from "./limits";

/**
 * Identical-failure detection (§8 "Limits").
 *
 * When the same tool call with identical arguments fails repeatedly, the loop
 * stops and surfaces the failure instead of retrying forever. A tool result
 * with `isError: true` counts as a failure; a success clears the counter for
 * that (name, args) pair so a recovered call can fail again later without
 * tripping an old threshold.
 */

/**
 * Stable serialization of tool arguments so two structurally-identical argument
 * objects hash to the same key regardless of key insertion order. Numbers,
 * strings, booleans, null, arrays and plain objects are supported; the output
 * is a deterministic string suitable for map keys.
 */
export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Tracks consecutive failures per (tool name, stable args) pair. */
export class IdenticalFailureTracker {
  readonly #threshold: number;
  readonly #counts = new Map<string, number>();

  constructor(threshold = DEFAULT_AGENT_LOOP_LIMITS.identicalFailureThreshold) {
    this.#threshold = threshold;
  }

  /** The current consecutive-failure count for `(name, args)`. */
  count(name: string, args: unknown): number {
    return this.#counts.get(this.#key(name, args)) ?? 0;
  }

  /**
   * Record one tool-call attempt. Returns `true` when the failure count for
   * this `(name, args)` has reached the threshold and the loop should stop.
   * A successful attempt (`failed === false`) clears the counter.
   */
  record(name: string, args: unknown, failed: boolean): boolean {
    const key = this.#key(name, args);
    if (!failed) {
      this.#counts.delete(key);
      return false;
    }
    const next = (this.#counts.get(key) ?? 0) + 1;
    this.#counts.set(key, next);
    return next >= this.#threshold;
  }

  /** Forget every tracked count (a new turn starts fresh). */
  reset(): void {
    this.#counts.clear();
  }

  #key(name: string, args: unknown): string {
    return `${name}:${stableStringify(args)}`;
  }
}

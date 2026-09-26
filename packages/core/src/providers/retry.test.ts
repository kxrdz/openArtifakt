import { describe, expect, it } from "vitest";

import type { StreamEvent } from "@openartifact/shared";

import {
  isRetryableError,
  parseRetryAfter,
  ProviderHttpError,
  withRetry,
} from "./retry";

async function collect(iterable: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

/** An async iterable that rejects as soon as it is first pulled (no yield). */
function failingStream(error: unknown): AsyncIterable<StreamEvent> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
      return {
        next(): Promise<IteratorResult<StreamEvent>> {
          return Promise.reject(error);
        },
      };
    },
  };
}

/** A no-op sleep that records every delay it is asked to wait. */
function recordingSleep(delays: number[]): (ms: number) => Promise<void> {
  return async (ms: number) => {
    delays.push(ms);
  };
}

describe("parseRetryAfter", () => {
  it("parses delay-seconds (integer and decimal)", () => {
    expect(parseRetryAfter("5")).toBe(5000);
    expect(parseRetryAfter("1.5")).toBe(1500);
    expect(parseRetryAfter(3)).toBe(3000);
    expect(parseRetryAfter("0")).toBe(0);
  });

  it("parses an HTTP date into a positive delay", () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const delay = parseRetryAfter(future);
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(61_000);
  });

  it("clamps a past HTTP date to zero", () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfter(past)).toBe(0);
  });

  it("returns undefined for absent or invalid values", () => {
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
    expect(parseRetryAfter("garbage")).toBeUndefined();
    expect(parseRetryAfter(Number.NaN)).toBeUndefined();
  });
});

describe("isRetryableError", () => {
  it("classifies 429, 5xx and network failures as retryable", () => {
    expect(isRetryableError(new ProviderHttpError("rate limited", { status: 429 }))).toBe(true);
    expect(isRetryableError(new ProviderHttpError("server error", { status: 503 }))).toBe(true);
    expect(isRetryableError(new ProviderHttpError("dns failure"))).toBe(true);
    expect(isRetryableError(new TypeError("fetch failed"))).toBe(true);
  });

  it("classifies aborts and other 4xx as non-retryable", () => {
    expect(isRetryableError(new ProviderHttpError("bad request", { status: 400 }))).toBe(false);
    expect(isRetryableError(new ProviderHttpError("aborted", { aborted: true }))).toBe(false);
    expect(isRetryableError(new Error("unexpected"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("forwards a successful stream verbatim without retrying", async () => {
    let calls = 0;
    const source: () => AsyncIterable<StreamEvent> = () => {
      calls++;
      return (async function* (): AsyncGenerator<StreamEvent> {
        yield { type: "text_delta", text: "hello" };
        yield { type: "done", stopReason: "end_turn" };
      })();
    };

    const events = await collect(withRetry(source));

    expect(calls).toBe(1);
    expect(events).toEqual([
      { type: "text_delta", text: "hello" },
      { type: "done", stopReason: "end_turn" },
    ]);
  });

  it("retries a 429 and succeeds on the second attempt with jittered backoff", async () => {
    const delays: number[] = [];
    let calls = 0;
    const source: () => AsyncIterable<StreamEvent> = () => {
      calls++;
      if (calls === 1) {
        return failingStream(new ProviderHttpError("rate limited", { status: 429 }));
      }
      return (async function* (): AsyncGenerator<StreamEvent> {
        yield { type: "text_delta", text: "ok" };
        yield { type: "done", stopReason: "end_turn" };
      })();
    };

    const events = await collect(
      withRetry(source, {
        baseDelayMs: 1000,
        sleep: recordingSleep(delays),
        random: () => 0.5,
      }),
    );

    expect(calls).toBe(2);
    expect(events).toEqual([
      { type: "text_delta", text: "ok" },
      { type: "done", stopReason: "end_turn" },
    ]);
    // Equal jitter on attempt 1: exponential = 1000, delay = 500 + 0.5 * 500.
    expect(delays).toEqual([750]);
  });

  it("retries a network failure (TypeError)", async () => {
    let calls = 0;
    const source: () => AsyncIterable<StreamEvent> = () => {
      calls++;
      if (calls === 1) {
        return failingStream(new TypeError("fetch failed"));
      }
      return (async function* (): AsyncGenerator<StreamEvent> {
        yield { type: "done", stopReason: "end_turn" };
      })();
    };

    const events = await collect(withRetry(source, { sleep: async () => {}, random: () => 0 }));

    expect(calls).toBe(2);
    expect(events).toEqual([{ type: "done", stopReason: "end_turn" }]);
  });

  it("gives up after maxAttempts and surfaces a retryable error", async () => {
    let calls = 0;
    const source: () => AsyncIterable<StreamEvent> = () => {
      calls++;
      return failingStream(new ProviderHttpError("server error", { status: 503 }));
    };

    const events = await collect(
      withRetry(source, { baseDelayMs: 1000, sleep: async () => {}, random: () => 0 }),
    );

    expect(calls).toBe(3);
    expect(events).toEqual([
      {
        type: "error",
        message: "Provider request failed after 3 attempts: server error",
        retryable: true,
      },
    ]);
  });

  it("does not retry a non-retryable error", async () => {
    let calls = 0;
    const source: () => AsyncIterable<StreamEvent> = () => {
      calls++;
      return failingStream(new ProviderHttpError("bad request", { status: 400 }));
    };

    const events = await collect(
      withRetry(source, { sleep: async () => { throw new Error("should not sleep"); } }),
    );

    expect(calls).toBe(1);
    expect(events).toEqual([{ type: "error", message: "bad request", retryable: false }]);
  });

  it("honors Retry-After seconds over backoff", async () => {
    const delays: number[] = [];
    let calls = 0;
    const source: () => AsyncIterable<StreamEvent> = () => {
      calls++;
      if (calls === 1) {
        return failingStream(new ProviderHttpError("rate limited", { status: 429, retryAfterMs: 5000 }));
      }
      return (async function* (): AsyncGenerator<StreamEvent> {
        yield { type: "done", stopReason: "end_turn" };
      })();
    };

    await collect(
      withRetry(source, { baseDelayMs: 1000, sleep: recordingSleep(delays), random: () => 0.5 }),
    );

    expect(calls).toBe(2);
    expect(delays).toEqual([5000]);
  });

  it("never retries after partial output; surfaces the failure instead", async () => {
    let calls = 0;
    const source: () => AsyncIterable<StreamEvent> = () => {
      calls++;
      return (async function* (): AsyncGenerator<StreamEvent> {
        yield { type: "text_delta", text: "partial" };
        throw new ProviderHttpError("rate limited", { status: 429 });
      })();
    };

    const events = await collect(
      withRetry(source, { sleep: async () => { throw new Error("should not sleep"); } }),
    );

    expect(calls).toBe(1);
    expect(events).toEqual([
      { type: "text_delta", text: "partial" },
      {
        type: "error",
        message: "Provider failed after partial output: rate limited",
        retryable: false,
      },
    ]);
  });

  it("does not retry an aborted request", async () => {
    let calls = 0;
    const source: () => AsyncIterable<StreamEvent> = () => {
      calls++;
      return failingStream(new ProviderHttpError("aborted", { aborted: true }));
    };

    const events = await collect(
      withRetry(source, { sleep: async () => { throw new Error("should not sleep"); } }),
    );

    expect(calls).toBe(1);
    expect(events).toEqual([{ type: "error", message: "aborted", retryable: false }]);
  });

  it("does not start a request once the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    let calls = 0;
    const source: () => AsyncIterable<StreamEvent> = () => {
      calls++;
      return (async function* (): AsyncGenerator<StreamEvent> {
        yield { type: "done", stopReason: "end_turn" };
      })();
    };

    const events = await collect(withRetry(source, { signal: controller.signal }));

    expect(calls).toBe(0);
    expect(events).toEqual([{ type: "error", message: "Request aborted", retryable: false }]);
  });

  it("rejects a non-positive maxAttempts", async () => {
    const source: () => AsyncIterable<StreamEvent> = () => failingStream(new Error("unused"));
    await expect(collect(withRetry(source, { maxAttempts: 0 }))).rejects.toThrow(
      "maxAttempts must be >= 1",
    );
  });
});

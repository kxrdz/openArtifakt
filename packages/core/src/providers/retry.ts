import type { StreamEvent } from "@openartifact/shared";

/**
 * Retry helper for provider requests (§4 Reliability).
 *
 * `withRetry` wraps a *source* — a function that issues one provider request
 * and returns an async iterable of canonical `StreamEvent`s — and re-invokes it
 * on retryable failures. The retry boundary is the whole request: it retries
 * only while nothing has been streamed yet, so a consumer can never see the
 * same output twice. Once the source has yielded a single event, any later
 * failure is surfaced immediately as an `error` event rather than retried.
 *
 * Retry policy (see design.md "Retry helper"):
 * - retries 429, 5xx and network failures (never aborts or 4xx),
 * - at most `maxAttempts` total attempts (default 3, i.e. up to 2 retries),
 * - exponential backoff with equal jitter, capped at `maxDelayMs`,
 * - honors a server-supplied `Retry-After` (seconds or HTTP date) exactly.
 */

/** A failure raised by a provider request, carrying HTTP status and retry hints. */
export class ProviderHttpError extends Error {
  /** HTTP status when the server answered with an error, `undefined` for network failures. */
  readonly status?: number;
  /** Parsed `Retry-After` delay in milliseconds, when the server supplied one. */
  readonly retryAfterMs?: number;
  /** True when the failure is an explicit user abort; aborts are never retried. */
  readonly aborted: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      retryAfterMs?: number;
      aborted?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ProviderHttpError";
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.aborted = options.aborted ?? false;
  }
}

/**
 * Parse an RFC 7231 `Retry-After` value into a delay in milliseconds:
 * either delay-seconds (a non-negative decimal) or an HTTP date.
 */
export function parseRetryAfter(value: string | number | null | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, value) * 1000 : undefined;
  }
  const raw = value.trim();
  if (raw === "") return undefined;

  // delay-seconds: `\d+(\.\d+)?`
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const seconds = Number(raw);
    return Number.isFinite(seconds) ? Math.max(0, seconds) * 1000 : undefined;
  }

  // HTTP date (e.g. "Wed, 21 Oct 2015 07:28:00 GMT"); a past date is no delay.
  const date = Date.parse(raw);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Default retryable classifier: 429, 5xx, and network-level failures
 * (a `TypeError`, which is what `fetch` throws on a failed connection).
 * Aborts and other 4xx statuses are not retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ProviderHttpError) {
    if (error.aborted) return false;
    if (error.status === undefined) return true; // network failure
    return error.status === 429 || error.status >= 500;
  }
  if (isAbortError(error)) return false;
  return error instanceof TypeError;
}

export interface RetryOptions {
  /** Total number of attempts including the first (default 3). */
  maxAttempts?: number;
  /** Base exponential-backoff delay in milliseconds (default 500). */
  baseDelayMs?: number;
  /** Upper bound for the computed backoff delay (default 10_000). */
  maxDelayMs?: number;
  /** Classify an error as retryable (default: 429/5xx/network via {@link isRetryableError}). */
  isRetryable?: (error: unknown) => boolean;
  /** Extract the `Retry-After` delay in ms from an error (default: `ProviderHttpError.retryAfterMs`). */
  retryAfterMs?: (error: unknown) => number | undefined;
  /** Abort signal; once aborted no new attempt is started. */
  signal?: AbortSignal;
  /** Inject the delay for tests (default: `setTimeout`). */
  sleep?: (ms: number) => Promise<void>;
  /** Inject jitter randomness in `[0,1)` for tests (default: `Math.random`). */
  random?: () => number;
}

function defaultRetryAfterMs(error: unknown): number | undefined {
  return error instanceof ProviderHttpError ? error.retryAfterMs : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Equal jitter: uniformly random within `[exp/2, exp)`, so there is always a positive delay. */
function backoffDelay(attempt: number, base: number, max: number, random: () => number): number {
  const exponential = Math.min(max, base * 2 ** (attempt - 1));
  const half = exponential / 2;
  return Math.floor(half + random() * half);
}

/**
 * Wrap a provider request source with retry/backoff. Yields the source's
 * events verbatim and converts a thrown retryable failure into an `error`
 * event, terminating the stream. Never retries after any output has streamed.
 */
export async function* withRetry(
  source: () => AsyncIterable<StreamEvent>,
  options: RetryOptions = {},
): AsyncIterable<StreamEvent> {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 10_000,
    isRetryable = isRetryableError,
    retryAfterMs = defaultRetryAfterMs,
    signal,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  if (maxAttempts < 1) {
    throw new Error("withRetry: maxAttempts must be >= 1");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      yield { type: "error", message: "Request aborted", retryable: false };
      return;
    }

    let emitted = false;

    try {
      for await (const event of source()) {
        emitted = true;
        yield event;
        if (event.type === "done" || event.type === "error") return;
      }
      // Source finished without a terminal event; forward that as-is (the
      // adapter is responsible for the terminal `done`/`error`).
      return;
    } catch (error) {
      // Never retry once output has streamed: surface the failure instead.
      if (emitted) {
        yield {
          type: "error",
          message: `Provider failed after partial output: ${errorMessage(error)}`,
          retryable: false,
        };
        return;
      }

      if (signal?.aborted || !isRetryable(error)) {
        yield { type: "error", message: errorMessage(error), retryable: false };
        return;
      }

      if (attempt < maxAttempts) {
        const retryAfter = retryAfterMs(error);
        const delay =
          retryAfter !== undefined
            ? retryAfter
            : backoffDelay(attempt, baseDelayMs, maxDelayMs, random);
        await sleep(delay);
        continue;
      }

      yield {
        type: "error",
        message: `Provider request failed after ${maxAttempts} ${
          maxAttempts === 1 ? "attempt" : "attempts"
        }: ${errorMessage(error)}`,
        retryable: true,
      };
      return;
    }
  }
}

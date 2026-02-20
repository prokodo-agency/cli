import { debug } from './logger';

export interface PollOptions<T> {
  /** Async function called each tick; return the value to stop polling. */
  fn: () => Promise<T | null>;
  /** Return true when the value means "done" (stop polling). */
  isDone: (value: T) => boolean;
  /** Total timeout in ms. */
  timeoutMs: number;
  /** Initial interval between polls in ms. Default 1_000. */
  initialIntervalMs?: number;
  /** Max interval cap in ms. Default 10_000. */
  maxIntervalMs?: number;
  /** Label for debug logging. */
  label?: string;
}

export class PollTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs / 1000}s`);
    this.name = 'PollTimeoutError';
  }
}

/**
 * Generic polling loop with exponential back-off.
 * Resolves with the first "done" value —or—
 * rejects with PollTimeoutError when timeoutMs is exceeded.
 */
export async function poll<T>(opts: PollOptions<T>): Promise<T> {
  const {
    fn,
    isDone,
    timeoutMs,
    initialIntervalMs = 1_000,
    maxIntervalMs = 10_000,
    label = 'poll',
  } = opts;

  const deadline = Date.now() + timeoutMs;
  let interval = initialIntervalMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    debug(`${label}: attempt ${++attempt}`);

    const value = await fn();

    if (value !== null && isDone(value)) {
      debug(`${label}: done after ${attempt} attempts`);
      return value;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const wait = Math.min(interval, remaining);
    await sleep(wait);

    // Double interval up to maxIntervalMs
    interval = Math.min(interval * 2, maxIntervalMs);
  }

  throw new PollTimeoutError(label, timeoutMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

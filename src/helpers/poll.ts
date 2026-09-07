/**
 * Async helpers for the notification flow.
 *
 * The specs use Playwright's built-in `expect.poll()` / `expect(fn).toPass()`
 * for "keep asserting until it holds". This module adds only the two things
 * those don't give you:
 *
 *  - `waitFor` — poll until a value is READY, then return it, so a test can make
 *    several assertions about the same object.
 *  - `sleep` — wait a fixed time (for "assert nothing happened after the full
 *    budget"); Playwright's only fixed wait is `page.waitForTimeout`, which is
 *    page-scoped and lint-discouraged, and API specs have no page.
 *
 * The `poll` fixture injects the per-environment timeout / interval.
 */

export interface WaitForOptions {
  timeoutMs?: number;
  intervalMs?: number;
  /** Context for the timeout message, e.g. "notification for transaction abc". */
  description?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_INTERVAL_MS = 150;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call `fn` on an interval until it returns a truthy value, then resolve with
 * it. On timeout, throw an error carrying elapsed time, attempts, and the last
 * value seen.
 */
export async function waitFor<T>(
  fn: () => T | Promise<T>,
  options: WaitForOptions = {},
): Promise<NonNullable<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const label = options.description ? ` waiting for ${options.description}` : '';

  const start = Date.now();
  let attempts = 0;
  let lastValue: unknown;

  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    const value = await fn();
    lastValue = value;
    if (value) return value as NonNullable<T>;
    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out after ${Date.now() - start}ms (${attempts} attempts)${label}. ` +
      `Last value: ${JSON.stringify(lastValue) ?? String(lastValue)}`,
  );
}

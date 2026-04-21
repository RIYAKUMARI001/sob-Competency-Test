/**
 * src/utils/timeout.ts
 *
 * withTimeout() — wraps any Promise with a hard deadline.
 * Used around every relay fetch to prevent hanging the MCP server.
 */

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Reject with TimeoutError if `promise` does not settle within `ms` milliseconds.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
}

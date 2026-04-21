/**
 * tests/timeout.test.ts
 *
 * Tests for the withTimeout() utility — verifies that promises that
 * exceed the deadline are rejected with a TimeoutError.
 */

import { describe, it, expect, vi } from "vitest";
import { withTimeout, TimeoutError } from "../src/utils/timeout.js";

describe("withTimeout()", () => {
  it("resolves when the promise settles before the deadline", async () => {
    const fast = Promise.resolve(42);
    await expect(withTimeout(fast, 1000)).resolves.toBe(42);
  });

  it("rejects with TimeoutError when the promise exceeds the deadline", async () => {
    vi.useFakeTimers();
    const slow = new Promise<never>(() => {}); // never resolves
    const race = withTimeout(slow, 500);
    vi.advanceTimersByTime(501);
    await expect(race).rejects.toBeInstanceOf(TimeoutError);
    vi.useRealTimers();
  });

  it("TimeoutError message includes the timeout duration", async () => {
    vi.useFakeTimers();
    const slow = new Promise<never>(() => {});
    const race = withTimeout(slow, 200);
    vi.advanceTimersByTime(201);
    try {
      await race;
    } catch (err) {
      expect(err).toBeInstanceOf(TimeoutError);
      expect((err as TimeoutError).message).toContain("200ms");
    }
    vi.useRealTimers();
  });

  it("does not reject a fast promise as TimeoutError", async () => {
    const fast = Promise.resolve("done");
    const result = await withTimeout(fast, 50);
    expect(result).toBe("done");
  });

  it("propagates non-timeout rejections unchanged", async () => {
    const failing = Promise.reject(new Error("network error"));
    await expect(withTimeout(failing, 1000)).rejects.toThrow("network error");
  });

  it("clears the internal timer when promise resolves before timeout", async () => {
    // This test ensures no dangling timers that would prevent process exit
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    await withTimeout(Promise.resolve("ok"), 500);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

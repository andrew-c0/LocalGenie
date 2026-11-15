import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTrailingThrottle } from "./trailingThrottle";

const INTERVAL_MS = 2000;

describe("createTrailingThrottle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies the first change at once", () => {
    const apply = vi.fn();
    const throttle = createTrailingThrottle<string | null>(null, apply, INTERVAL_MS);
    throttle.push("Downloading A 10%");
    expect(apply).toHaveBeenCalledExactlyOnceWith("Downloading A 10%");
  });

  it("holds a change inside the interval and applies the latest value at its end", () => {
    const apply = vi.fn();
    const throttle = createTrailingThrottle<string | null>(null, apply, INTERVAL_MS);
    throttle.push("A 10%");
    vi.advanceTimersByTime(500);
    throttle.push("A 20%");
    throttle.push("A 30%");
    expect(apply).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(INTERVAL_MS);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith("A 30%");
  });

  it("does not apply a value equal to the last applied one", () => {
    const apply = vi.fn();
    const throttle = createTrailingThrottle<string | null>(null, apply, INTERVAL_MS);
    throttle.push("A 10%");
    throttle.push("A 10%");
    vi.advanceTimersByTime(INTERVAL_MS);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("skips a null start when the initial value is null", () => {
    const apply = vi.fn();
    const throttle = createTrailingThrottle<string | null>(null, apply, INTERVAL_MS);
    throttle.push(null);
    expect(apply).not.toHaveBeenCalled();
  });

  it("applies a change at once again once the interval has passed", () => {
    const apply = vi.fn();
    const throttle = createTrailingThrottle<string | null>(null, apply, INTERVAL_MS);
    throttle.push("A 10%");
    vi.advanceTimersByTime(INTERVAL_MS + 1);
    throttle.push(null);
    expect(apply).toHaveBeenLastCalledWith(null);
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("drops a pending value on cancel", () => {
    const apply = vi.fn();
    const throttle = createTrailingThrottle<string | null>(null, apply, INTERVAL_MS);
    throttle.push("A 10%");
    throttle.push("A 20%");
    throttle.cancel();
    vi.advanceTimersByTime(INTERVAL_MS);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenLastCalledWith("A 10%");
  });
});

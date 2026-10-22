import { describe, expect, it } from "vitest";
import { runWithConcurrency } from "./async";

describe("runWithConcurrency", () => {
  it("processes every item and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const done: number[] = [];
    const items = Array.from({ length: 10 }, (_, i) => i);

    await runWithConcurrency(items, 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      done.push(n);
    });

    expect(done.sort((a, b) => a - b)).toEqual(items);
    expect(peak).toBe(3);
  });

  it("resolves immediately for an empty list", async () => {
    await expect(runWithConcurrency([], 4, async () => undefined)).resolves.toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { isNearBottom } from "./scroll";

describe("isNearBottom", () => {
  it("is true at the bottom and within a few pixels of it", () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 600, clientHeight: 400 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 560, clientHeight: 400 })).toBe(true);
  });

  it("is false once the user has scrolled up", () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 300, clientHeight: 400 })).toBe(false);
  });

  it("is true when nothing overflows", () => {
    expect(isNearBottom({ scrollHeight: 300, scrollTop: 0, clientHeight: 400 })).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { pageStyleNonce, styleTagAttributes } from "./cspNonce";

const docWith = (nonces: Array<string | undefined>) => ({
  querySelectorAll: () => nonces.map((nonce) => ({ nonce })),
});

describe("pageStyleNonce", () => {
  it("is undefined when no tag carries a nonce", () => {
    expect(pageStyleNonce(docWith([undefined, ""]))).toBeUndefined();
    expect(pageStyleNonce(docWith([]))).toBeUndefined();
  });

  it("reads the nonce of the first tag that has one", () => {
    expect(pageStyleNonce(docWith([undefined, "abc123", "other"]))).toBe("abc123");
  });
});

describe("styleTagAttributes", () => {
  it("carries the nonce only when there is one", () => {
    expect(styleTagAttributes("abc123")).toEqual({ nonce: "abc123" });
    expect(styleTagAttributes(undefined)).toEqual({});
  });
});

import { describe, expect, it } from "vitest";
import { dispatchLoadStateOf } from "./dispatchLoad";

describe("dispatchLoadStateOf", () => {
  it("is loading until the first read ends, with no error yet", () => {
    expect(dispatchLoadStateOf(false, null)).toBe("loading");
  });

  it("is failed when the read ended with an error", () => {
    expect(dispatchLoadStateOf(false, "database is locked")).toBe("failed");
  });

  it("is ready once loaded, whatever the error slot holds", () => {
    expect(dispatchLoadStateOf(true, null)).toBe("ready");
  });
});

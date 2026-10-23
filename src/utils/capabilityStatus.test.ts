import { describe, expect, it } from "vitest";
import type { CapabilityEntry } from "../types";
import { capabilityMap, isRejected, REJECTED_REASON, rejectedReason } from "./capabilityStatus";

const entry = (overrides: Partial<CapabilityEntry> = {}): CapabilityEntry => ({
  key: "seed",
  status: "works",
  detail: "Two runs with seed 42 gave the same reply.",
  probedAt: 1,
  stale: false,
  ...overrides,
});

describe("isRejected", () => {
  it("is true only for a current rejection", () => {
    expect(isRejected(entry({ status: "rejected" }))).toBe(true);
    expect(isRejected(entry({ status: "works" }))).toBe(false);
    expect(isRejected(entry({ status: "accepted" }))).toBe(false);
    expect(isRejected(undefined)).toBe(false);
  });

  it("is false for a stale rejection, which stays editable until scanned again", () => {
    expect(isRejected(entry({ status: "rejected", stale: true }))).toBe(false);
  });
});

describe("rejectedReason", () => {
  it("gives the reason only for a current rejection", () => {
    expect(rejectedReason(entry({ status: "rejected" }))).toBe(REJECTED_REASON);
    expect(rejectedReason(entry({ status: "rejected", detail: "400: bad" }))).toBe(REJECTED_REASON);
    expect(rejectedReason(entry({ status: "accepted" }))).toBeUndefined();
    expect(rejectedReason(entry({ status: "works" }))).toBeUndefined();
    expect(rejectedReason(entry({ status: "rejected", stale: true }))).toBeUndefined();
    expect(rejectedReason(undefined)).toBeUndefined();
  });
});

describe("capabilityMap", () => {
  it("indexes results by setting key", () => {
    const map = capabilityMap([entry({ key: "seed" }), entry({ key: "topK", status: "accepted" })]);
    expect(map.seed?.status).toBe("works");
    expect(map.topK?.status).toBe("accepted");
    expect(map.temperature).toBeUndefined();
  });

  it("indexes the thinking and tool-call results by their keys", () => {
    const map = capabilityMap([
      entry({ key: "thinking", status: "works" }),
      entry({ key: "toolCalls", status: "accepted" }),
    ]);
    expect(map.thinking?.status).toBe("works");
    expect(map.toolCalls?.status).toBe("accepted");
    expect(map.seed).toBeUndefined();
  });
});

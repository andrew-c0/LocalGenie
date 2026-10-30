import { describe, expect, it } from "vitest";
import { ramGateMessage } from "./ramGate";

const GB = 1_073_741_824;

describe("ramGateMessage", () => {
  // 16 GB total, 10% kept free = 1.6 GB.
  const memory = { totalBytes: 16 * GB, availableBytes: 6 * GB };

  it("allows a load that leaves the headroom free", () => {
    expect(
      ramGateMessage({ estimateBytes: 4 * GB, memory, headroomPercent: 10, freedBytes: 0 }),
    ).toBeNull();
  });

  it("refuses a load that would leave less than the headroom, with the numbers", () => {
    const message = ramGateMessage({
      estimateBytes: 5 * GB,
      memory,
      headroomPercent: 10,
      freedBytes: 0,
    });
    expect(message).toBe("Needs about 5.00 GB, 6.00 GB free, 1.60 GB kept free");
  });

  it("allows a load that fits once the replaced model's RAM is counted as free", () => {
    expect(
      ramGateMessage({ estimateBytes: 5 * GB, memory, headroomPercent: 10, freedBytes: 2 * GB }),
    ).toBeNull();
  });

  it("refuses when the replaced model does not free enough, and says so", () => {
    const message = ramGateMessage({
      estimateBytes: 9 * GB,
      memory,
      headroomPercent: 10,
      freedBytes: 2 * GB,
    });
    expect(message).toContain("after the replaced model stops");
  });

  it("does not block when the estimate is unknown", () => {
    expect(
      ramGateMessage({ estimateBytes: null, memory, headroomPercent: 10, freedBytes: 0 }),
    ).toBeNull();
  });

  it("does not block when the memory figures are unknown", () => {
    expect(
      ramGateMessage({ estimateBytes: 99 * GB, memory: null, headroomPercent: 10, freedBytes: 0 }),
    ).toBeNull();
  });

  it("with a zero headroom, refuses only when the model is bigger than the free RAM", () => {
    expect(
      ramGateMessage({ estimateBytes: 6 * GB, memory, headroomPercent: 0, freedBytes: 0 }),
    ).toBeNull();
    expect(
      ramGateMessage({ estimateBytes: 6 * GB + 1, memory, headroomPercent: 0, freedBytes: 0 }),
    ).not.toBeNull();
  });
});

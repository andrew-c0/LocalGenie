import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";

describe("formatBytes", () => {
  it("shows gigabytes with two decimals", () => {
    expect(formatBytes(4 * 1_073_741_824)).toBe("4.00 GB");
  });

  it("shows megabytes, kilobytes and bytes below those", () => {
    expect(formatBytes(5 * 1_048_576)).toBe("5.0 MB");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("shows a dash for a missing size", () => {
    expect(formatBytes(undefined)).toBe("—");
  });
});

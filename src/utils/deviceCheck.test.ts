import { describe, expect, it } from "vitest";
import { deviceMatchesCompute, deviceMismatchMessage } from "./deviceCheck";

describe("deviceMatchesCompute", () => {
  it("expects an HTP device on NPU", () => {
    expect(deviceMatchesCompute("npu", "HTP0")).toBe(true);
    expect(deviceMatchesCompute("npu", "htp1")).toBe(true);
    expect(deviceMatchesCompute("npu", "CPU")).toBe(false);
    expect(deviceMatchesCompute("npu", "GPU")).toBe(false);
  });

  it("expects a CPU device on CPU, case-insensitively", () => {
    expect(deviceMatchesCompute("cpu", "CPU")).toBe(true);
    expect(deviceMatchesCompute("cpu", "cpu")).toBe(true);
    expect(deviceMatchesCompute("cpu", "HTP0")).toBe(false);
  });

  it("expects anything that is neither HTP nor CPU on GPU", () => {
    expect(deviceMatchesCompute("gpu", "GPU")).toBe(true);
    expect(deviceMatchesCompute("gpu", "Adreno")).toBe(true);
    expect(deviceMatchesCompute("gpu", "HTP0")).toBe(false);
    expect(deviceMatchesCompute("gpu", "CPU")).toBe(false);
  });
});

describe("deviceMismatchMessage", () => {
  it("is null when the device matches", () => {
    expect(deviceMismatchMessage("npu", "HTP0")).toBeNull();
  });

  it("names the requested compute and the device the server runs on", () => {
    expect(deviceMismatchMessage("npu", "CPU")).toBe("Requested NPU but the server runs on CPU.");
  });

  it("is null when the unit is unknown", () => {
    expect(deviceMismatchMessage("npu", null)).toBeNull();
    expect(deviceMismatchMessage("npu", "  ")).toBeNull();
  });
});

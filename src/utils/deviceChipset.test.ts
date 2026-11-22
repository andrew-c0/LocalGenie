import { beforeEach, describe, expect, it, vi } from "vitest";

const configGet = vi.fn();
vi.mock("../services/geniex", () => ({
  configGet: (key: string) => configGet(key),
}));

import { useModelStore } from "../stores/modelStore";
import { readChipset, refreshChipset } from "./deviceChipset";

describe("readChipset", () => {
  beforeEach(() => {
    configGet.mockReset();
  });

  it("returns the chipset the CLI reports", async () => {
    configGet.mockResolvedValue("Snapdragon X Elite CRD");
    await expect(readChipset()).resolves.toBe("Snapdragon X Elite CRD");
    expect(configGet).toHaveBeenCalledWith("chipset");
  });

  it("returns null when the read fails, without throwing", async () => {
    configGet.mockRejectedValue(new Error("CLI not installed"));
    await expect(readChipset()).resolves.toBeNull();
  });
});

describe("refreshChipset", () => {
  beforeEach(() => {
    configGet.mockReset();
    useModelStore.setState({ cliInstalled: null, chipset: null });
  });

  it("reads the chipset once the CLI is installed", async () => {
    configGet.mockResolvedValue("Snapdragon X Elite CRD");
    useModelStore.setState({ cliInstalled: true });
    await refreshChipset();
    expect(useModelStore.getState().chipset).toBe("Snapdragon X Elite CRD");
  });

  it("clears the chipset without reading it when the CLI is not installed", async () => {
    useModelStore.setState({ cliInstalled: false, chipset: "Snapdragon X Elite CRD" });
    await refreshChipset();
    expect(configGet).not.toHaveBeenCalled();
    expect(useModelStore.getState().chipset).toBeNull();
  });

  it("keeps the current chipset while the CLI state is unread", async () => {
    useModelStore.setState({ cliInstalled: null, chipset: "Snapdragon X Elite CRD" });
    await refreshChipset();
    expect(configGet).not.toHaveBeenCalled();
    expect(useModelStore.getState().chipset).toBe("Snapdragon X Elite CRD");
  });
});

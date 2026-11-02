import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredRam } from "../utils/modelRam";

const loadStoredRam = vi.fn();
vi.mock("../services/modelRam", () => ({
  loadStoredRam: () => loadStoredRam(),
}));

import { useRamEstimateStore } from "./ramEstimateStore";

function ram(baseBytes: number): StoredRam {
  return { baseBytes, contextBytes: 0, approximate: false };
}

describe("ramEstimateStore", () => {
  beforeEach(() => {
    loadStoredRam.mockReset();
    useRamEstimateStore.setState({ ramByModel: {} });
  });

  it("stores what the read returns", async () => {
    loadStoredRam.mockResolvedValueOnce({ a: ram(1) });
    await useRamEstimateStore.getState().refresh();
    expect(useRamEstimateStore.getState().ramByModel.a.baseBytes).toBe(1);
  });

  it("keeps what is shown when a read fails", async () => {
    loadStoredRam.mockResolvedValueOnce({ a: ram(1) });
    await useRamEstimateStore.getState().refresh();
    loadStoredRam.mockRejectedValueOnce(new Error("boom"));
    await useRamEstimateStore.getState().refresh();
    expect(useRamEstimateStore.getState().ramByModel.a.baseBytes).toBe(1);
  });

  it("runs reads in order, so an older read never overwrites a newer one", async () => {
    let finishFirst: (value: Record<string, StoredRam>) => void = () => {};
    loadStoredRam.mockReturnValueOnce(
      new Promise((resolve) => {
        finishFirst = resolve;
      }),
    );
    loadStoredRam.mockResolvedValueOnce({ a: ram(2) });

    const first = useRamEstimateStore.getState().refresh();
    const second = useRamEstimateStore.getState().refresh();
    finishFirst({ a: ram(1) });
    await Promise.all([first, second]);

    expect(useRamEstimateStore.getState().ramByModel.a.baseBytes).toBe(2);
  });
});

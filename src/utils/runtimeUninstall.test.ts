import { beforeEach, describe, expect, it, vi } from "vitest";

const uninstallRuntime = vi.fn();
vi.mock("../services/runtimes", () => ({
  uninstallRuntime: (id: string) => uninstallRuntime(id),
  listRuntimes: vi.fn(),
  checkRuntimeUpdate: vi.fn(),
}));

const refreshAfterRuntimeChange = vi.fn();
vi.mock("./runtimeUsage", () => ({
  refreshAfterRuntimeChange: (id: string) => refreshAfterRuntimeChange(id),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("./toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    info: vi.fn(),
  },
}));

import { useDownloadStore } from "../stores/downloadStore";
import { useRuntimeStore } from "../stores/runtimeStore";
import { uninstallRuntimeNow } from "./runtimeUninstall";

const SD_CPP = { id: "sd-cpp", displayName: "stable-diffusion.cpp" };

describe("uninstallRuntimeNow", () => {
  beforeEach(() => {
    uninstallRuntime.mockReset().mockResolvedValue(undefined);
    refreshAfterRuntimeChange.mockReset().mockResolvedValue(undefined);
    toastSuccess.mockReset();
    toastError.mockReset();
    useDownloadStore.setState({ downloads: [] });
    useRuntimeStore.setState({ removingIds: [] });
  });

  it("marks the runtime busy while it runs, then removes it and reports success", async () => {
    let busyDuringCall: string[] = [];
    uninstallRuntime.mockImplementation(async () => {
      busyDuringCall = [...useRuntimeStore.getState().removingIds];
    });

    await uninstallRuntimeNow(SD_CPP);

    expect(busyDuringCall).toEqual(["sd-cpp"]);
    expect(useRuntimeStore.getState().removingIds).toEqual([]);
    expect(uninstallRuntime).toHaveBeenCalledWith("sd-cpp");
    expect(toastSuccess).toHaveBeenCalledWith("stable-diffusion.cpp removed");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("re-reads the runtime after the uninstall", async () => {
    await uninstallRuntimeNow(SD_CPP);
    expect(refreshAfterRuntimeChange).toHaveBeenCalledWith("sd-cpp");
  });

  it("reports a failure, clears the busy mark and still re-reads the runtime", async () => {
    uninstallRuntime.mockRejectedValue("file in use");

    await uninstallRuntimeNow(SD_CPP);

    expect(toastError).toHaveBeenCalledWith(
      "Uninstall failed",
      "stable-diffusion.cpp: file in use",
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(useRuntimeStore.getState().removingIds).toEqual([]);
    expect(refreshAfterRuntimeChange).toHaveBeenCalledWith("sd-cpp");
  });

  it("does not add an entry to the Downloads drawer", async () => {
    await uninstallRuntimeNow(SD_CPP);
    expect(useDownloadStore.getState().downloads).toEqual([]);
  });

  it("is refused while the runtime's install is queued or running", async () => {
    useDownloadStore.getState().enqueueRuntime({ runtimeId: "sd-cpp", displayName: "sd" });

    await uninstallRuntimeNow(SD_CPP);

    expect(uninstallRuntime).not.toHaveBeenCalled();
    expect(useRuntimeStore.getState().removingIds).toEqual([]);
    expect(refreshAfterRuntimeChange).not.toHaveBeenCalled();
  });

  it("is refused while the runtime is already being removed", async () => {
    useRuntimeStore.setState({ removingIds: ["sd-cpp"] });

    await uninstallRuntimeNow(SD_CPP);

    expect(uninstallRuntime).not.toHaveBeenCalled();
    expect(useRuntimeStore.getState().removingIds).toEqual(["sd-cpp"]);
  });

  it("does not block a different runtime's uninstall", async () => {
    useRuntimeStore.setState({ removingIds: ["geniex"] });

    await uninstallRuntimeNow(SD_CPP);

    expect(uninstallRuntime).toHaveBeenCalledWith("sd-cpp");
    expect(useRuntimeStore.getState().removingIds).toEqual(["geniex"]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeInfo, RuntimeUpdateInfo } from "../types";

const listRuntimes = vi.fn();
const checkRuntimeUpdate = vi.fn();
vi.mock("../services/runtimes", () => ({
  listRuntimes: () => listRuntimes(),
  checkRuntimeUpdate: (id: string) => checkRuntimeUpdate(id),
}));

import { useModelStore } from "./modelStore";
import { installedRuntimeIds, useRuntimeStore } from "./runtimeStore";

const runtime = (id: string, installedVersion: string | null): RuntimeInfo => ({
  id,
  displayName: id,
  repo: `org/${id}`,
  installedVersion,
});

const update = (id: string, latestVersion: string): RuntimeUpdateInfo => ({
  id,
  installedVersion: "1.0.0",
  latestVersion,
  updateAvailable: latestVersion !== "1.0.0",
  releaseUrl: `https://example.test/${id}`,
});

describe("runtimeStore", () => {
  beforeEach(() => {
    listRuntimes.mockReset();
    checkRuntimeUpdate.mockReset();
    useRuntimeStore.setState({
      runtimes: null,
      readError: null,
      updatesById: {},
      updateChecks: {},
    });
    useModelStore.setState({ cliInstalled: null });
  });

  it("stores the list that the read returns", async () => {
    listRuntimes.mockResolvedValueOnce([runtime("sd-cpp", "1.0.0")]);
    await useRuntimeStore.getState().refresh();
    expect(useRuntimeStore.getState().runtimes).toEqual([runtime("sd-cpp", "1.0.0")]);
  });

  it("keeps the same list object when a read finds nothing changed", async () => {
    listRuntimes.mockResolvedValueOnce([runtime("sd-cpp", "1.0.0")]);
    await useRuntimeStore.getState().refresh();
    const first = useRuntimeStore.getState().runtimes;
    listRuntimes.mockResolvedValueOnce([runtime("sd-cpp", "1.0.0")]);
    await useRuntimeStore.getState().refresh();
    expect(useRuntimeStore.getState().runtimes).toBe(first);
  });

  it("replaces the list when an install changes a version", async () => {
    listRuntimes.mockResolvedValueOnce([runtime("sd-cpp", null)]);
    await useRuntimeStore.getState().refresh();
    listRuntimes.mockResolvedValueOnce([runtime("sd-cpp", "1.0.0")]);
    await useRuntimeStore.getState().refresh();
    expect(installedRuntimeIds(useRuntimeStore.getState().runtimes)).toEqual(["sd-cpp"]);
  });

  it("keeps the known list and records the error when a read fails", async () => {
    listRuntimes.mockResolvedValueOnce([runtime("sd-cpp", "1.0.0")]);
    await useRuntimeStore.getState().refresh();
    listRuntimes.mockRejectedValueOnce(new Error("disk gone"));
    await useRuntimeStore.getState().refresh();
    expect(useRuntimeStore.getState().runtimes).toHaveLength(1);
    expect(useRuntimeStore.getState().readError).toBe("disk gone");
  });

  it("clears the error on the next good read", async () => {
    listRuntimes.mockRejectedValueOnce(new Error("disk gone"));
    await useRuntimeStore.getState().refresh();
    listRuntimes.mockResolvedValueOnce([]);
    await useRuntimeStore.getState().refresh();
    expect(useRuntimeStore.getState().readError).toBeNull();
  });

  it("sets cliInstalled from the GenieX entry of the list", async () => {
    listRuntimes.mockResolvedValueOnce([runtime("geniex", "2.0.0"), runtime("sd-cpp", null)]);
    await useRuntimeStore.getState().refresh();
    expect(useModelStore.getState().cliInstalled).toBe(true);

    listRuntimes.mockResolvedValueOnce([runtime("geniex", null), runtime("sd-cpp", "1.0.0")]);
    await useRuntimeStore.getState().refresh();
    expect(useModelStore.getState().cliInstalled).toBe(false);
  });

  it("does not change cliInstalled when the read fails", async () => {
    useModelStore.setState({ cliInstalled: true });
    listRuntimes.mockRejectedValueOnce(new Error("disk gone"));
    await useRuntimeStore.getState().refresh();
    expect(useModelStore.getState().cliInstalled).toBe(true);
  });
});

describe("checkUpdates", () => {
  beforeEach(() => {
    listRuntimes.mockReset();
    checkRuntimeUpdate.mockReset();
    useRuntimeStore.setState({
      runtimes: [runtime("geniex", null), runtime("sd-cpp", "1.0.0")],
      readError: null,
      updatesById: {},
      updateChecks: {},
    });
  });

  it("checks every runtime in the list", async () => {
    checkRuntimeUpdate.mockResolvedValue(update("geniex", "2.0.0"));
    await useRuntimeStore.getState().checkUpdates();
    expect(checkRuntimeUpdate).toHaveBeenCalledWith("geniex");
    expect(checkRuntimeUpdate).toHaveBeenCalledWith("sd-cpp");
  });

  it("keeps the successful checks and leaves out a runtime whose check failed", async () => {
    checkRuntimeUpdate.mockImplementation((id: string) =>
      id === "geniex"
        ? Promise.resolve(update("geniex", "2.0.0"))
        : Promise.reject(new Error("offline")),
    );
    await useRuntimeStore.getState().checkUpdates();
    const { updatesById } = useRuntimeStore.getState();
    expect(Object.keys(updatesById)).toEqual(["geniex"]);
    expect(updatesById.geniex?.latestVersion).toBe("2.0.0");
  });

  it("replaces the previous results on a new check", async () => {
    useRuntimeStore.setState({ updatesById: { "sd-cpp": update("sd-cpp", "1.0.0") } });
    checkRuntimeUpdate.mockImplementation((id: string) => Promise.resolve(update(id, "2.0.0")));
    await useRuntimeStore.getState().checkUpdates();
    expect(useRuntimeStore.getState().updatesById["sd-cpp"]?.latestVersion).toBe("2.0.0");
  });

  it("checks nothing while the list is unread", async () => {
    useRuntimeStore.setState({ runtimes: null });
    await useRuntimeStore.getState().checkUpdates();
    expect(checkRuntimeUpdate).not.toHaveBeenCalled();
    expect(useRuntimeStore.getState().updatesById).toEqual({});
  });

  it("marks every runtime as checking before any answer comes back", () => {
    checkRuntimeUpdate.mockReturnValue(new Promise(() => {}));
    void useRuntimeStore.getState().checkUpdates();
    expect(useRuntimeStore.getState().updateChecks).toEqual({
      geniex: { status: "checking", error: null },
      "sd-cpp": { status: "checking", error: null },
    });
  });

  it("sets a runtime to ok when its check succeeds", async () => {
    checkRuntimeUpdate.mockResolvedValue(update("geniex", "2.0.0"));
    await useRuntimeStore.getState().checkUpdate("geniex");
    expect(useRuntimeStore.getState().updateChecks.geniex).toEqual({ status: "ok", error: null });
  });

  it("sets a runtime to failed with the reason and drops its old entry when its check fails", async () => {
    useRuntimeStore.setState({ updatesById: { "sd-cpp": update("sd-cpp", "1.0.0") } });
    checkRuntimeUpdate.mockRejectedValueOnce(new Error("GitHub API error 403"));
    await useRuntimeStore.getState().checkUpdate("sd-cpp");
    const state = useRuntimeStore.getState();
    expect(state.updateChecks["sd-cpp"]).toEqual({
      status: "failed",
      error: "GitHub API error 403",
    });
    expect(state.updatesById["sd-cpp"]).toBeUndefined();
  });

  it("keeps the runtime list when a check fails", async () => {
    checkRuntimeUpdate.mockRejectedValue("offline");
    await useRuntimeStore.getState().checkUpdates();
    expect(useRuntimeStore.getState().runtimes).toHaveLength(2);
    expect(useRuntimeStore.getState().readError).toBeNull();
  });

  it("re-checks only the runtime it names", async () => {
    useRuntimeStore.setState({
      updateChecks: {
        geniex: { status: "failed", error: "offline" },
        "sd-cpp": { status: "ok", error: null },
      },
    });
    checkRuntimeUpdate.mockResolvedValue(update("geniex", "2.0.0"));
    await useRuntimeStore.getState().checkUpdate("geniex");
    expect(checkRuntimeUpdate).toHaveBeenCalledTimes(1);
    expect(useRuntimeStore.getState().updateChecks).toEqual({
      geniex: { status: "ok", error: null },
      "sd-cpp": { status: "ok", error: null },
    });
  });
});

describe("removingIds", () => {
  beforeEach(() => {
    useRuntimeStore.setState({ removingIds: [] });
  });

  it("holds a runtime from beginRemoving until endRemoving", () => {
    useRuntimeStore.getState().beginRemoving("sd-cpp");
    expect(useRuntimeStore.getState().removingIds).toEqual(["sd-cpp"]);
    useRuntimeStore.getState().endRemoving("sd-cpp");
    expect(useRuntimeStore.getState().removingIds).toEqual([]);
  });

  it("lists a runtime once however often it is begun", () => {
    useRuntimeStore.getState().beginRemoving("sd-cpp");
    useRuntimeStore.getState().beginRemoving("sd-cpp");
    expect(useRuntimeStore.getState().removingIds).toEqual(["sd-cpp"]);
  });

  it("ends only the runtime it names", () => {
    useRuntimeStore.getState().beginRemoving("geniex");
    useRuntimeStore.getState().beginRemoving("sd-cpp");
    useRuntimeStore.getState().endRemoving("geniex");
    expect(useRuntimeStore.getState().removingIds).toEqual(["sd-cpp"]);
  });
});

describe("installedRuntimeIds", () => {
  it("is null until the list is read, so nothing is locked", () => {
    expect(installedRuntimeIds(null)).toBeNull();
  });

  it("lists only the runtimes with an installed version", () => {
    expect(installedRuntimeIds([runtime("sd-cpp", "1.0.0"), runtime("sherpa-onnx", null)])).toEqual(
      ["sd-cpp"],
    );
  });
});

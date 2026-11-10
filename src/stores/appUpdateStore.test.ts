import { beforeEach, describe, expect, it, vi } from "vitest";

const checkForAppUpdate = vi.fn();
const downloadAndInstallAppUpdate = vi.fn();
const getNotifiedAppVersion = vi.fn();
const relaunchApp = vi.fn();
const saveNotifiedAppVersion = vi.fn();
vi.mock("../services/appUpdate", () => ({
  checkForAppUpdate: () => checkForAppUpdate(),
  downloadAndInstallAppUpdate: (onProgress: unknown) => downloadAndInstallAppUpdate(onProgress),
  getNotifiedAppVersion: () => getNotifiedAppVersion(),
  relaunchApp: () => relaunchApp(),
  saveNotifiedAppVersion: (version: string) => saveNotifiedAppVersion(version),
}));

import { EMPTY_DOWNLOAD_PROGRESS } from "../utils/appUpdate";
import { useAppUpdateStore } from "./appUpdateStore";

const found = {
  version: "1.2.0",
  currentVersion: "1.1.0",
  notes: "- fixes",
  date: null,
};

const initialState = {
  status: "idle" as const,
  update: null,
  progress: EMPTY_DOWNLOAD_PROGRESS,
  lastCheckedAt: null,
  error: null,
  errorAction: null,
  notifiedVersion: null,
  notifiedLoaded: false,
};

/** A promise that the test settles by hand. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("appUpdateStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    relaunchApp.mockResolvedValue(undefined);
    saveNotifiedAppVersion.mockResolvedValue(undefined);
    useAppUpdateStore.setState(initialState);
  });

  it("shows the update when the check finds a newer version", async () => {
    checkForAppUpdate.mockResolvedValue(found);
    await useAppUpdateStore.getState().checkNow();
    const state = useAppUpdateStore.getState();
    expect(state.status).toBe("available");
    expect(state.update).toEqual(found);
    expect(state.lastCheckedAt).not.toBeNull();
    expect(state.error).toBeNull();
  });

  it("reads as up to date when the check finds none", async () => {
    checkForAppUpdate.mockResolvedValue(null);
    await useAppUpdateStore.getState().checkNow();
    expect(useAppUpdateStore.getState().status).toBe("upToDate");
    expect(useAppUpdateStore.getState().update).toBeNull();
  });

  it("keeps the known update and records a check error", async () => {
    useAppUpdateStore.setState({ update: found });
    const failure = new Error("error sending request for url");
    checkForAppUpdate.mockRejectedValue(failure);
    await useAppUpdateStore.getState().checkNow();
    const state = useAppUpdateStore.getState();
    expect(state.status).toBe("error");
    expect(state.errorAction).toBe("check");
    expect(state.error).toBe(failure);
    expect(state.update).toEqual(found);
    expect(state.lastCheckedAt).not.toBeNull();
  });

  it("runs one check at a time", async () => {
    const pending = deferred<null>();
    checkForAppUpdate.mockReturnValue(pending.promise);
    const first = useAppUpdateStore.getState().checkNow();
    const second = useAppUpdateStore.getState().checkNow();
    expect(useAppUpdateStore.getState().status).toBe("checking");
    pending.resolve(null);
    await Promise.all([first, second]);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not install without a known update", async () => {
    await useAppUpdateStore.getState().installUpdate();
    expect(downloadAndInstallAppUpdate).not.toHaveBeenCalled();
    expect(useAppUpdateStore.getState().status).toBe("idle");
  });

  it("follows the download to installing, then restarts", async () => {
    useAppUpdateStore.setState({ status: "available", update: found });
    downloadAndInstallAppUpdate.mockImplementation(async (onProgress: (event: unknown) => void) => {
      onProgress({ kind: "started", contentLength: 100 });
      onProgress({ kind: "progress", chunkLength: 40 });
      expect(useAppUpdateStore.getState().status).toBe("downloading");
      expect(useAppUpdateStore.getState().progress).toEqual({
        downloadedBytes: 40,
        totalBytes: 100,
        fraction: 0.4,
      });
      onProgress({ kind: "finished" });
    });

    await useAppUpdateStore.getState().installUpdate();

    expect(useAppUpdateStore.getState().status).toBe("installing");
    expect(relaunchApp).toHaveBeenCalledTimes(1);
  });

  it("records an install error that can be retried", async () => {
    useAppUpdateStore.setState({ status: "available", update: found });
    const failure = new Error("disk full");
    downloadAndInstallAppUpdate.mockRejectedValue(failure);
    await useAppUpdateStore.getState().installUpdate();
    const state = useAppUpdateStore.getState();
    expect(state.status).toBe("error");
    expect(state.errorAction).toBe("install");
    expect(state.error).toBe(failure);
    expect(state.update).toEqual(found);
  });

  it("keeps the installing state when the restart fails", async () => {
    useAppUpdateStore.setState({ status: "available", update: found });
    downloadAndInstallAppUpdate.mockResolvedValue(undefined);
    relaunchApp.mockRejectedValue(new Error("no restart"));
    await useAppUpdateStore.getState().installUpdate();
    expect(useAppUpdateStore.getState().status).toBe("installing");
  });

  it("reads the saved notified version once", async () => {
    getNotifiedAppVersion.mockResolvedValue("1.2.0");
    await useAppUpdateStore.getState().loadNotifiedVersion();
    expect(useAppUpdateStore.getState()).toMatchObject({
      notifiedVersion: "1.2.0",
      notifiedLoaded: true,
    });
  });

  it("leaves nothing loaded when the saved version cannot be read", async () => {
    getNotifiedAppVersion.mockRejectedValue(new Error("database locked"));
    await useAppUpdateStore.getState().loadNotifiedVersion();
    expect(useAppUpdateStore.getState().notifiedLoaded).toBe(false);
  });

  it("records a notified version and saves it", () => {
    useAppUpdateStore.getState().recordNotified("1.2.0");
    expect(useAppUpdateStore.getState().notifiedVersion).toBe("1.2.0");
    expect(saveNotifiedAppVersion).toHaveBeenCalledWith("1.2.0");
  });
});

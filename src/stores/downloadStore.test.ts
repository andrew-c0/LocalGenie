import { beforeEach, describe, expect, it } from "vitest";
import {
  isRuntimeInstallActive,
  type RuntimeDownload,
  runtimeDownloadId,
  useDownloadStore,
} from "./downloadStore";

const SD_CPP: RuntimeDownload = {
  runtimeId: "sd-cpp",
  displayName: "stable-diffusion.cpp",
};

const GENIEX: RuntimeDownload = {
  runtimeId: "geniex",
  displayName: "GenieX CLI",
};

const entry = (id: string) => useDownloadStore.getState().downloads.find((d) => d.id === id);

describe("enqueueRuntime", () => {
  beforeEach(() => {
    useDownloadStore.setState({ downloads: [] });
  });

  it("queues the runtime under runtime:<id>, labelled with its display name", () => {
    useDownloadStore.getState().enqueueRuntime(SD_CPP);
    const item = entry("runtime:sd-cpp");
    expect(item?.status).toBe("queued");
    expect(item?.label).toBe("stable-diffusion.cpp");
    expect(item?.runtime).toEqual(SD_CPP);
    expect(item?.variant).toBeUndefined();
    expect(item?.aihub).toBeUndefined();
  });

  it("ignores a second install while the first is queued or running", () => {
    const store = useDownloadStore.getState();
    store.enqueueRuntime(SD_CPP);
    store.setStatus("runtime:sd-cpp", "downloading");
    useDownloadStore.getState().enqueueRuntime({ ...SD_CPP, version: "2.0.0" });
    expect(useDownloadStore.getState().downloads).toHaveLength(1);
    expect(entry("runtime:sd-cpp")?.runtime?.version).toBeUndefined();
  });

  it("queues the runtime again once its entry has finished", () => {
    const store = useDownloadStore.getState();
    store.enqueueRuntime(SD_CPP);
    store.setStatus("runtime:sd-cpp", "finished");
    useDownloadStore.getState().enqueueRuntime({ ...SD_CPP, version: "2.0.0" });
    expect(entry("runtime:sd-cpp")?.status).toBe("queued");
    expect(entry("runtime:sd-cpp")?.runtime?.version).toBe("2.0.0");
  });

  it("queues the GenieX CLI like any other runtime, under its own id", () => {
    useDownloadStore.getState().enqueueRuntime(GENIEX);
    expect(entry("runtime:geniex")?.status).toBe("queued");
    expect(entry("runtime:geniex")?.label).toBe("GenieX CLI");
    expect(runtimeDownloadId("geniex")).toBe("runtime:geniex");
  });
});

describe("requeue", () => {
  beforeEach(() => {
    useDownloadStore.setState({ downloads: [] });
  });

  it("queues a cancelled runtime install again, keeping what it installs", () => {
    const store = useDownloadStore.getState();
    store.enqueueRuntime(SD_CPP);
    store.setStatus("runtime:sd-cpp", "cancelled");
    useDownloadStore.getState().requeue("runtime:sd-cpp");
    expect(entry("runtime:sd-cpp")?.status).toBe("queued");
    expect(entry("runtime:sd-cpp")?.runtime).toEqual(SD_CPP);
  });

  it("does not requeue a runtime that is still running", () => {
    const store = useDownloadStore.getState();
    store.enqueueRuntime(SD_CPP);
    store.setStatus("runtime:sd-cpp", "importing");
    useDownloadStore.getState().requeue("runtime:sd-cpp");
    expect(entry("runtime:sd-cpp")?.status).toBe("importing");
  });
});

describe("isRuntimeInstallActive", () => {
  beforeEach(() => {
    useDownloadStore.setState({ downloads: [] });
  });

  it("is true while the runtime's install is queued or running", () => {
    useDownloadStore.getState().enqueueRuntime(SD_CPP);
    expect(isRuntimeInstallActive(useDownloadStore.getState().downloads, "sd-cpp")).toBe(true);
    useDownloadStore.getState().setStatus("runtime:sd-cpp", "downloading");
    expect(isRuntimeInstallActive(useDownloadStore.getState().downloads, "sd-cpp")).toBe(true);
  });

  it("is false once the install has finished or failed", () => {
    const store = useDownloadStore.getState();
    store.enqueueRuntime(SD_CPP);
    store.setStatus("runtime:sd-cpp", "error", "boom");
    expect(isRuntimeInstallActive(useDownloadStore.getState().downloads, "sd-cpp")).toBe(false);
  });

  it("is false for another runtime", () => {
    useDownloadStore.getState().enqueueRuntime(GENIEX);
    expect(isRuntimeInstallActive(useDownloadStore.getState().downloads, "sd-cpp")).toBe(false);
  });
});

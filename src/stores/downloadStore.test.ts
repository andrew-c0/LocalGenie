import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaygroundDownloadProgress } from "../types";
import type { HubFacetSummary } from "../utils/hubModelInfo";
import {
  type AihubDownload,
  type DownloadItem,
  downloadSourceName,
  importTargetOf,
  isPlaygroundDownloadActive,
  pipelineQueueOf,
  playgroundDownloadId,
  playgroundDownloadViewOf,
  progressFractionOf,
  type RuntimeDownload,
  useDownloadStore,
} from "./downloadStore";

const FACETS: HubFacetSummary = {
  task: null,
  library: null,
  license: null,
  paramCount: null,
  paramCountApproximate: false,
  baseRelation: null,
  baseRepo: null,
  quantBits: [],
};

const aihubZip: AihubDownload = {
  modelName: "qualcomm/Model",
  downloadUrl: "https://example.test/model.zip",
  folder: "model",
  zipName: "model.zip",
  precision: "w4a16",
  facets: FACETS,
};

const runtimeInstall: RuntimeDownload = {
  runtimeId: "sd-cpp",
  displayName: "stable-diffusion.cpp",
};

describe("downloadSourceName", () => {
  it("names AI Hub for an AI Hub zip", () => {
    expect(downloadSourceName({ aihub: aihubZip, runtime: undefined })).toBe("Qualcomm AI Hub");
  });

  it("names GitHub for a runtime install", () => {
    expect(downloadSourceName({ aihub: undefined, runtime: runtimeInstall })).toBe("GitHub");
  });

  it("names Hugging Face for anything else", () => {
    expect(downloadSourceName({ aihub: undefined, runtime: undefined })).toBe("Hugging Face");
  });

  it("names the service a Playground download comes from", () => {
    const playground = {
      kind: "speech" as const,
      modelId: "whisper",
      name: "Whisper",
      source: "GitHub",
      progress: null,
      transfer: null,
    };
    expect(downloadSourceName({ playground })).toBe("GitHub");
  });
});

const progressEvent = (received: number): PlaygroundDownloadProgress => ({
  modelId: "sd-turbo",
  fileName: "model.safetensors",
  fileIndex: 0,
  fileCount: 2,
  received,
  total: 100,
});

const startSdTurbo = () =>
  useDownloadStore.getState().startPlayground({
    kind: "image",
    modelId: "sd-turbo",
    name: "SD Turbo",
    source: "Hugging Face",
  });

const itemOf = (id: string): DownloadItem | undefined =>
  useDownloadStore.getState().downloads.find((d) => d.id === id);

const entry = (overrides: Partial<DownloadItem>): DownloadItem => ({
  id: "owner/model",
  label: "owner/model",
  received: 0,
  total: null,
  speed: 0,
  status: "importing",
  startedAt: 0,
  ...overrides,
});

const ocrEntry = (id: string, status: DownloadItem["status"]): DownloadItem =>
  entry({
    id,
    label: "OCR",
    status,
    playground: {
      kind: "ocr",
      modelId: id,
      name: "OCR",
      source: "Hugging Face",
      progress: null,
      transfer: null,
    },
  });

describe("Playground downloads in the drawer", () => {
  beforeEach(() => {
    useDownloadStore.setState({ downloads: [] });
  });

  it("uses the playground: prefix as the drawer id, the id the backend cancels by", () => {
    expect(playgroundDownloadId("sd-turbo")).toBe("playground:sd-turbo");
  });

  it("starts as a running download with its name, source and no progress yet", () => {
    startSdTurbo();
    const item = itemOf("playground:sd-turbo");
    expect(item?.status).toBe("downloading");
    expect(item?.label).toBe("SD Turbo");
    expect(item?.playground).toEqual({
      kind: "image",
      modelId: "sd-turbo",
      name: "SD Turbo",
      source: "Hugging Face",
      progress: null,
      transfer: null,
    });
    expect(isPlaygroundDownloadActive(useDownloadStore.getState().downloads, "sd-turbo")).toBe(
      true,
    );
  });

  it("does not start a second entry while the same model is active", () => {
    startSdTurbo();
    startSdTurbo();
    expect(useDownloadStore.getState().downloads).toHaveLength(1);
  });

  it("records progress while downloading", () => {
    startSdTurbo();
    useDownloadStore.getState().setPlaygroundProgress("sd-turbo", progressEvent(40));
    expect(itemOf("playground:sd-turbo")?.playground?.progress?.received).toBe(40);
  });

  it("finishes into history and ignores later progress", () => {
    startSdTurbo();
    useDownloadStore.getState().finishPlayground("sd-turbo");
    useDownloadStore.getState().setPlaygroundProgress("sd-turbo", progressEvent(90));
    const item = itemOf("playground:sd-turbo");
    expect(item?.status).toBe("finished");
    expect(item?.finishedAt).toBeDefined();
    expect(item?.playground?.progress).toBeNull();
    expect(isPlaygroundDownloadActive(useDownloadStore.getState().downloads, "sd-turbo")).toBe(
      false,
    );
  });

  it("fails with the raw error kept on the entry", () => {
    startSdTurbo();
    useDownloadStore.getState().failPlayground("sd-turbo", "connection reset by peer");
    const item = itemOf("playground:sd-turbo");
    expect(item?.status).toBe("error");
    expect(item?.error).toBe("connection reset by peer");
  });

  it("cancels as cancelled, not failed, and keeps no error text", () => {
    startSdTurbo();
    useDownloadStore.getState().cancelPlayground("sd-turbo");
    const item = itemOf("playground:sd-turbo");
    expect(item?.status).toBe("cancelled");
    expect(item?.error).toBeUndefined();
  });

  it("ignores a late failure or cancel once the download has finished", () => {
    startSdTurbo();
    useDownloadStore.getState().finishPlayground("sd-turbo");
    useDownloadStore.getState().failPlayground("sd-turbo", "late error");
    useDownloadStore.getState().cancelPlayground("sd-turbo");
    expect(itemOf("playground:sd-turbo")?.status).toBe("finished");
  });

  it("restarts a failed download on the same entry, with no error and no old progress", () => {
    startSdTurbo();
    useDownloadStore.getState().setPlaygroundProgress("sd-turbo", progressEvent(10));
    useDownloadStore.getState().failPlayground("sd-turbo", "boom");
    startSdTurbo();
    const downloads = useDownloadStore.getState().downloads;
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.status).toBe("downloading");
    expect(downloads[0]?.error).toBeUndefined();
    expect(downloads[0]?.playground?.progress).toBeNull();
  });

  it("is never queued, so requeue leaves it alone and the pipeline does not pick it up", () => {
    startSdTurbo();
    useDownloadStore.getState().cancelPlayground("sd-turbo");
    useDownloadStore.getState().requeue("playground:sd-turbo");
    expect(itemOf("playground:sd-turbo")?.status).toBe("cancelled");
    expect(pipelineQueueOf(useDownloadStore.getState().downloads)).toEqual([]);
  });

  it("keeps a queued Playground entry out of the pipeline queue", () => {
    const queued = ocrEntry("playground:ocr", "queued");
    expect(pipelineQueueOf([queued])).toEqual([]);
  });

  it("still queues a Hugging Face entry", () => {
    const hf = entry({ id: "owner/model", status: "queued" });
    expect(pipelineQueueOf([hf])).toEqual([hf]);
  });

  it("leaves another entry alone when a Playground event names a different model", () => {
    useDownloadStore.getState().enqueue({
      repoId: "owner/model",
      main: { filename: "model.gguf", precision: "Q4_0", sizeLabel: null, shard: null },
      sidecars: [],
    });
    useDownloadStore.getState().finishPlayground("sd-turbo");
    expect(itemOf("owner/model")?.status).toBe("queued");
  });
});

describe("importTargetOf", () => {
  it("routes an import to its repo's own active entry", () => {
    expect(importTargetOf([entry({})], "owner/model")).toBe("owner/model");
  });

  it("routes an OCR import to the one active OCR download when the repo has no active entry", () => {
    const downloads = [entry({ status: "finished" }), ocrEntry("playground:ocr", "importing")];
    expect(importTargetOf(downloads, "owner/model")).toBe("playground:ocr");
  });

  it("returns null when neither an active entry nor a single OCR download applies", () => {
    expect(importTargetOf([], "owner/model")).toBeNull();
    const twoOcr = [ocrEntry("a", "downloading"), ocrEntry("b", "downloading")];
    expect(importTargetOf(twoOcr, "owner/model")).toBeNull();
  });

  it("ignores a Playground download that is not OCR", () => {
    const image = entry({
      id: "playground:sd",
      status: "downloading",
      playground: {
        kind: "image",
        modelId: "sd",
        name: "SD",
        source: "Hugging Face",
        progress: null,
        transfer: null,
      },
    });
    expect(importTargetOf([image], "owner/model")).toBeNull();
  });
});

describe("Playground download speed and size", () => {
  beforeEach(() => {
    useDownloadStore.setState({ downloads: [] });
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const fileEvent = (
    fileIndex: number,
    received: number,
    total: number,
    fileCount = 2,
  ): PlaygroundDownloadProgress => ({
    modelId: "sd-turbo",
    fileName: `file-${fileIndex}.bin`,
    fileIndex,
    fileCount,
    received,
    total,
  });

  it("keeps the item's bytes and speed from the events", () => {
    startSdTurbo();
    useDownloadStore.getState().setPlaygroundProgress("sd-turbo", fileEvent(0, 0, 1000, 1));
    vi.setSystemTime(1000);
    useDownloadStore.getState().setPlaygroundProgress("sd-turbo", fileEvent(0, 400, 1000, 1));

    const item = itemOf("playground:sd-turbo");
    expect(item?.received).toBe(400);
    expect(item?.speed).toBe(400);
    expect(item?.total).toBe(1000);
  });

  it("leaves the size unknown while an earlier file runs", () => {
    startSdTurbo();
    useDownloadStore.getState().setPlaygroundProgress("sd-turbo", fileEvent(0, 400, 1000));
    expect(itemOf("playground:sd-turbo")?.total).toBeNull();
  });

  it("adds the earlier files to the byte count once the backend moves on", () => {
    startSdTurbo();
    useDownloadStore.getState().setPlaygroundProgress("sd-turbo", fileEvent(0, 1000, 1000));
    useDownloadStore.getState().setPlaygroundProgress("sd-turbo", fileEvent(1, 100, 400));

    const item = itemOf("playground:sd-turbo");
    expect(item?.received).toBe(1100);
    expect(item?.total).toBe(1400);
  });

  it("starts a restarted download with no bytes and no speed", () => {
    startSdTurbo();
    useDownloadStore.getState().setPlaygroundProgress("sd-turbo", fileEvent(0, 500, 1000));
    useDownloadStore.getState().failPlayground("sd-turbo", "boom");
    startSdTurbo();

    const item = itemOf("playground:sd-turbo");
    expect(item?.received).toBe(0);
    expect(item?.total).toBeNull();
    expect(item?.speed).toBe(0);
    expect(item?.playground?.transfer).toBeNull();
  });
});

describe("playgroundDownloadViewOf", () => {
  const playgroundItem = (overrides: Partial<DownloadItem>): DownloadItem =>
    entry({
      id: "playground:sd",
      status: "downloading",
      playground: {
        kind: "image",
        modelId: "sd",
        name: "SD",
        source: "GitHub",
        progress: null,
        transfer: null,
      },
      ...overrides,
    });

  it("reads a running download with its percentage", () => {
    const item = playgroundItem({
      playground: {
        kind: "image",
        modelId: "sd",
        name: "SD",
        source: "GitHub",
        progress: {
          modelId: "sd",
          fileName: "a",
          fileIndex: 0,
          fileCount: 2,
          received: 50,
          total: 100,
        },
        transfer: null,
      },
    });
    expect(playgroundDownloadViewOf(item)).toEqual({
      status: "downloading",
      percent: 25,
      error: null,
      source: "GitHub",
    });
  });

  it("keeps showing a running download while an OCR model is imported", () => {
    expect(playgroundDownloadViewOf(ocrEntry("playground:ocr", "importing"))?.status).toBe(
      "downloading",
    );
  });

  it("reads a failure with its raw error and source", () => {
    const item = playgroundItem({ status: "error", error: "connection reset" });
    expect(playgroundDownloadViewOf(item)).toEqual({
      status: "error",
      percent: null,
      error: "connection reset",
      source: "GitHub",
    });
  });

  it("reads a cancel as cancelled, with no error", () => {
    const item = playgroundItem({ status: "cancelled" });
    expect(playgroundDownloadViewOf(item)?.status).toBe("cancelled");
    expect(playgroundDownloadViewOf(item)?.error).toBeNull();
  });

  it("has no view once the download has finished, so the row shows the files on disk", () => {
    expect(playgroundDownloadViewOf(playgroundItem({ status: "finished" }))).toBeNull();
  });

  it("has no view for a model with no entry, or for an entry that is not Playground", () => {
    expect(playgroundDownloadViewOf(undefined)).toBeNull();
    expect(playgroundDownloadViewOf(entry({ id: "owner/model", status: "error" }))).toBeNull();
  });
});

describe("progressFractionOf", () => {
  it("uses the whole-download percentage for a Playground download", () => {
    const item = ocrEntry("playground:ocr", "downloading");
    const withProgress: DownloadItem = {
      ...item,
      playground: {
        kind: "ocr",
        modelId: "ocr",
        name: "OCR",
        source: "Hugging Face",
        transfer: null,
        progress: {
          modelId: "ocr",
          fileName: "a",
          fileIndex: 1,
          fileCount: 2,
          received: 0,
          total: 100,
        },
      },
    };
    expect(progressFractionOf(withProgress)).toBe(0.5);
  });

  it("is null for a Playground download before its first event", () => {
    expect(progressFractionOf(ocrEntry("playground:ocr", "downloading"))).toBeNull();
  });

  it("uses the bytes of any other download, and is null while its size is unknown", () => {
    expect(progressFractionOf(entry({ received: 30, total: 120 }))).toBe(0.25);
    expect(progressFractionOf(entry({ received: 30, total: null }))).toBeNull();
  });
});

describe("download warnings", () => {
  const variant = {
    repoId: "owner/model",
    main: { filename: "model.gguf", precision: "Q4_0", sizeLabel: null, shard: null },
    sidecars: [],
  };

  beforeEach(() => {
    useDownloadStore.setState({ downloads: [] });
  });

  it("adds a warning to the entry and keeps the ones before it", () => {
    useDownloadStore.getState().enqueue(variant);
    useDownloadStore.getState().addWarning("owner/model", "first");
    useDownloadStore.getState().addWarning("owner/model", "second");
    expect(itemOf("owner/model")?.warnings).toEqual(["first", "second"]);
  });

  it("adds the same warning once", () => {
    useDownloadStore.getState().enqueue(variant);
    useDownloadStore.getState().addWarning("owner/model", "projector skipped");
    useDownloadStore.getState().addWarning("owner/model", "projector skipped");
    expect(itemOf("owner/model")?.warnings).toEqual(["projector skipped"]);
  });

  it("keeps the warnings on a finished entry", () => {
    useDownloadStore.getState().enqueue(variant);
    useDownloadStore.getState().addWarning("owner/model", "projector skipped");
    useDownloadStore.getState().setStatus("owner/model", "finished");
    expect(itemOf("owner/model")?.warnings).toEqual(["projector skipped"]);
  });

  it("clears the warnings when the entry is queued again, so the projector is checked afresh", () => {
    useDownloadStore.getState().enqueue(variant);
    useDownloadStore.getState().addWarning("owner/model", "projector skipped");
    useDownloadStore.getState().setStatus("owner/model", "error", "connection reset by peer");
    useDownloadStore.getState().requeue("owner/model");
    expect(itemOf("owner/model")?.warnings).toBeUndefined();
  });

  it("clears the warnings when a new request replaces the entry", () => {
    useDownloadStore.getState().enqueue(variant);
    useDownloadStore.getState().addWarning("owner/model", "projector skipped");
    useDownloadStore.getState().setStatus("owner/model", "finished");
    useDownloadStore.getState().enqueue(variant);
    expect(itemOf("owner/model")?.warnings).toBeUndefined();
  });

  it("leaves another entry's warnings alone", () => {
    useDownloadStore.getState().enqueue(variant);
    useDownloadStore.getState().enqueue({ ...variant, repoId: "owner/other" });
    useDownloadStore.getState().addWarning("owner/other", "projector skipped");
    expect(itemOf("owner/model")?.warnings).toBeUndefined();
    expect(itemOf("owner/other")?.warnings).toEqual(["projector skipped"]);
  });
});

describe("automatic retry bookkeeping", () => {
  const variant = {
    repoId: "owner/model",
    main: { filename: "model.gguf", precision: "Q4_0", sizeLabel: null, shard: null },
    sidecars: [],
  };

  /** A Hugging Face entry that failed on a network error. */
  const failedHf = () => {
    const store = useDownloadStore.getState();
    store.enqueue(variant);
    store.setStatus("owner/model", "error", "Download request failed: error sending request");
  };

  const hfItem = () => itemOf("owner/model");

  beforeEach(() => {
    useDownloadStore.setState({ downloads: [] });
  });

  it("counts each automatic retry, and a manual resume starts a fresh budget", () => {
    failedHf();
    useDownloadStore.getState().requeue("owner/model", "automatic");
    expect(hfItem()?.autoRetries).toBe(1);
    expect(hfItem()?.status).toBe("queued");

    useDownloadStore
      .getState()
      .setStatus("owner/model", "error", "Download request failed: timed out");
    useDownloadStore.getState().requeue("owner/model", "automatic");
    expect(hfItem()?.autoRetries).toBe(2);

    useDownloadStore.getState().setStatus("owner/model", "error", "connection reset by peer");
    useDownloadStore.getState().requeue("owner/model");
    expect(hfItem()?.autoRetries).toBe(0);
    expect(hfItem()?.status).toBe("queued");
  });

  it("resets the budget when the download finishes", () => {
    failedHf();
    useDownloadStore.getState().requeue("owner/model", "automatic");
    useDownloadStore.getState().requeue("owner/model", "automatic");
    useDownloadStore.getState().setStatus("owner/model", "finished");
    expect(hfItem()?.autoRetries).toBe(0);
  });

  it("starts a new request with a fresh budget, even after a failure that used retries", () => {
    failedHf();
    useDownloadStore.getState().requeue("owner/model", "automatic");
    useDownloadStore.getState().requeue("owner/model", "automatic");
    useDownloadStore.getState().setStatus("owner/model", "error", "connection reset by peer");
    useDownloadStore.getState().enqueue(variant);
    expect(hfItem()?.autoRetries).toBe(0);
  });

  it("keeps the count through a failure, so the next automatic retry sees the ones before", () => {
    failedHf();
    useDownloadStore.getState().requeue("owner/model", "automatic");
    useDownloadStore.getState().setStatus("owner/model", "error", "connection reset by peer");
    expect(hfItem()?.autoRetries).toBe(1);
  });

  it("counts a Playground automatic start, and a manual start begins again from zero", () => {
    const store = useDownloadStore.getState();
    const playground = {
      kind: "image" as const,
      modelId: "sd-turbo",
      name: "SD Turbo",
      source: "Hugging Face",
    };
    store.startPlayground(playground);
    store.failPlayground("sd-turbo", "connection reset by peer");
    store.startPlayground(playground, "automatic");
    expect(itemOf("playground:sd-turbo")?.autoRetries).toBe(1);

    store.failPlayground("sd-turbo", "connection reset by peer");
    store.startPlayground(playground);
    expect(itemOf("playground:sd-turbo")?.autoRetries).toBe(0);
  });

  it("resets a Playground budget when the download finishes", () => {
    const store = useDownloadStore.getState();
    store.startPlayground(
      { kind: "image", modelId: "sd-turbo", name: "SD Turbo", source: "Hugging Face" },
      "automatic",
    );
    store.finishPlayground("sd-turbo");
    expect(itemOf("playground:sd-turbo")?.autoRetries).toBe(0);
  });

  it("sets and clears the time of the next automatic retry", () => {
    failedHf();
    useDownloadStore.getState().setAutoRetryAt("owner/model", 12_345);
    expect(hfItem()?.autoRetryAt).toBe(12_345);
    useDownloadStore.getState().setAutoRetryAt("owner/model", undefined);
    expect(hfItem()?.autoRetryAt).toBeUndefined();
  });

  it("drops a scheduled retry when the download is cancelled", () => {
    failedHf();
    useDownloadStore.getState().setAutoRetryAt("owner/model", 12_345);
    useDownloadStore.getState().setStatus("owner/model", "cancelled");
    expect(hfItem()?.autoRetryAt).toBeUndefined();
  });

  it("drops a scheduled retry when the Playground download is cancelled", () => {
    const store = useDownloadStore.getState();
    store.startPlayground({
      kind: "image",
      modelId: "sd-turbo",
      name: "SD Turbo",
      source: "Hugging Face",
    });
    store.setAutoRetryAt("playground:sd-turbo", 12_345);
    store.cancelPlayground("sd-turbo");
    expect(itemOf("playground:sd-turbo")?.status).toBe("cancelled");
    expect(itemOf("playground:sd-turbo")?.autoRetryAt).toBeUndefined();
  });

  it("gives an entry a fresh budget on reset, without touching its status", () => {
    failedHf();
    useDownloadStore.getState().requeue("owner/model", "automatic");
    useDownloadStore.getState().requeue("owner/model", "automatic");
    useDownloadStore.getState().setStatus("owner/model", "error", "connection reset by peer");
    useDownloadStore.getState().resetAutoRetryBudget("owner/model");
    expect(hfItem()?.autoRetries).toBe(0);
    expect(hfItem()?.status).toBe("error");
  });
});

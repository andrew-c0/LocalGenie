import { describe, expect, it } from "vitest";
import type { DownloadItem, DownloadStatus } from "../stores/downloadStore";
import { downloadActivityOf, downloadFinishedNotice } from "./downloadActivity";

const entry = (overrides: Partial<DownloadItem> & { id: string }): DownloadItem => ({
  label: overrides.id,
  received: 0,
  total: null,
  speed: 0,
  status: "downloading",
  startedAt: 0,
  ...overrides,
});

const withStatus = (status: DownloadStatus, overrides: Partial<DownloadItem> = {}) =>
  entry({ id: "org/model", label: "Qwen3 4B", status, ...overrides });

describe("downloadActivityOf", () => {
  it("is null for a finished, failed or cancelled download", () => {
    expect(downloadActivityOf(withStatus("finished"))).toBeNull();
    expect(downloadActivityOf(withStatus("error"))).toBeNull();
    expect(downloadActivityOf(withStatus("cancelled"))).toBeNull();
  });

  it("gives a transfer its percent", () => {
    const download = withStatus("downloading", { received: 42, total: 100 });
    expect(downloadActivityOf(download)).toEqual({
      id: "org/model",
      label: "Downloading Qwen3 4B",
      percent: 42,
    });
  });

  it("has no percent while the size is not known", () => {
    const download = withStatus("downloading", { received: 42, total: null });
    expect(downloadActivityOf(download)?.percent).toBeUndefined();
  });

  it("says importing with no percent", () => {
    const download = withStatus("importing", { received: 100, total: 100 });
    expect(downloadActivityOf(download)).toEqual({
      id: "org/model",
      label: "Importing Qwen3 4B",
      percent: undefined,
    });
  });

  it("says waiting for a queued download", () => {
    expect(downloadActivityOf(withStatus("queued"))?.label).toBe("Waiting to download Qwen3 4B");
  });

  it("names a runtime install by its display name", () => {
    const runtime = { runtimeId: "geniex", displayName: "GenieX CLI" };
    const download = entry({
      id: "runtime:geniex",
      label: "GenieX CLI",
      runtime,
      status: "downloading",
      received: 1,
      total: 4,
    });
    expect(downloadActivityOf(download)).toEqual({
      id: "runtime:geniex",
      label: "Installing GenieX CLI",
      percent: 25,
    });
  });

  it("says waiting to install for a queued runtime", () => {
    const runtime = { runtimeId: "geniex", displayName: "GenieX CLI" };
    const download = entry({
      id: "runtime:geniex",
      label: "GenieX CLI",
      runtime,
      status: "queued",
    });
    expect(downloadActivityOf(download)?.label).toBe("Waiting to install GenieX CLI");
  });

  it("names a Playground download by its model name", () => {
    const playground = {
      kind: "image" as const,
      modelId: "sd-model",
      name: "SD Turbo",
      source: "Hugging Face",
      progress: null,
      transfer: null,
    };
    const download = entry({
      id: "playground:sd-model",
      label: "SD Turbo",
      playground,
      status: "downloading",
    });
    expect(downloadActivityOf(download)?.label).toBe("Downloading SD Turbo");
  });
});

describe("downloadFinishedNotice", () => {
  it("says a model finished downloading", () => {
    expect(downloadFinishedNotice(withStatus("finished"))).toEqual({
      title: "Download complete",
      body: "Qwen3 4B finished downloading.",
    });
  });

  it("says a runtime was installed", () => {
    const runtime = { runtimeId: "geniex", displayName: "GenieX CLI" };
    const download = entry({
      id: "runtime:geniex",
      label: "GenieX CLI",
      runtime,
      status: "finished",
    });
    expect(downloadFinishedNotice(download).body).toBe("GenieX CLI was installed.");
  });
});

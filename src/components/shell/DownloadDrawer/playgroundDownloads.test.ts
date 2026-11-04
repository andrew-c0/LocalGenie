import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadImageModel,
  downloadOcrModel,
  downloadSpeechModel,
  downloadUpscaleModel,
} from "../../../services/playground";
import { playgroundDownloadViewOf, useDownloadStore } from "../../../stores/downloadStore";
import { beginPlaygroundDownload, retryPlaygroundDownload } from "./playgroundDownloads";

vi.mock("../../../services/playground", () => ({
  downloadImageModel: vi.fn(),
  downloadUpscaleModel: vi.fn(),
  downloadSpeechModel: vi.fn(),
  downloadOcrModel: vi.fn(),
}));

/** Let the rejected promise of a runner reach its catch handler. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const drawerItem = (modelId: string) =>
  useDownloadStore.getState().downloads.find((d) => d.id === `playground:${modelId}`);

/** The row's view of a model's download, read from the drawer item. */
const rowViewOf = (modelId: string) => playgroundDownloadViewOf(drawerItem(modelId));

describe("beginPlaygroundDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(downloadImageModel).mockResolvedValue(undefined);
    useDownloadStore.setState({ downloads: [] });
  });

  it("shows the download in the drawer and on the model row before the backend answers", () => {
    vi.mocked(downloadImageModel).mockReturnValue(new Promise(() => undefined));
    beginPlaygroundDownload({ kind: "image", modelId: "sd-turbo", name: "SD Turbo" });

    expect(drawerItem("sd-turbo")?.status).toBe("downloading");
    expect(drawerItem("sd-turbo")?.playground?.source).toBe("Hugging Face");
    expect(rowViewOf("sd-turbo")?.status).toBe("downloading");
    expect(downloadImageModel).toHaveBeenCalledWith("sd-turbo");
  });

  it("runs the backend download of the kind it was given", () => {
    vi.mocked(downloadUpscaleModel).mockResolvedValue(undefined);
    vi.mocked(downloadSpeechModel).mockResolvedValue(undefined);
    vi.mocked(downloadOcrModel).mockResolvedValue(undefined);

    beginPlaygroundDownload({ kind: "upscale", modelId: "esrgan", name: "ESRGAN" });
    beginPlaygroundDownload({ kind: "speech", modelId: "whisper", name: "Whisper" });
    beginPlaygroundDownload({ kind: "ocr", modelId: "ocr", name: "OCR" });

    expect(downloadUpscaleModel).toHaveBeenCalledWith("esrgan");
    expect(downloadSpeechModel).toHaveBeenCalledWith("whisper");
    expect(downloadOcrModel).toHaveBeenCalledWith("ocr");
    expect(drawerItem("esrgan")?.playground?.source).toBe("GitHub");
    expect(drawerItem("whisper")?.playground?.source).toBe("GitHub");
    expect(drawerItem("ocr")?.playground?.source).toBe("Hugging Face");
  });

  it("does not start a second backend download while the same model is active", () => {
    vi.mocked(downloadImageModel).mockReturnValue(new Promise(() => undefined));
    beginPlaygroundDownload({ kind: "image", modelId: "sd-turbo", name: "SD Turbo" });
    beginPlaygroundDownload({ kind: "image", modelId: "sd-turbo", name: "SD Turbo" });

    expect(downloadImageModel).toHaveBeenCalledTimes(1);
    expect(useDownloadStore.getState().downloads).toHaveLength(1);
  });

  it("records a failure the events did not report on the drawer item, which the row reads", async () => {
    vi.mocked(downloadImageModel).mockRejectedValue(new Error("unknown model"));
    beginPlaygroundDownload({ kind: "image", modelId: "missing", name: "Missing" });
    await flush();

    expect(drawerItem("missing")?.status).toBe("error");
    expect(drawerItem("missing")?.error).toContain("unknown model");
    expect(rowViewOf("missing")?.status).toBe("error");
    expect(rowViewOf("missing")?.error).toContain("unknown model");
  });
});

describe("retryPlaygroundDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDownloadStore.setState({ downloads: [] });
  });

  it("starts a failed download again on its entry, with the same kind and model", async () => {
    vi.mocked(downloadImageModel).mockRejectedValueOnce(new Error("network down"));
    beginPlaygroundDownload({ kind: "image", modelId: "sd-turbo", name: "SD Turbo" });
    await flush();
    expect(drawerItem("sd-turbo")?.status).toBe("error");

    vi.mocked(downloadImageModel).mockResolvedValueOnce(undefined);
    const failed = drawerItem("sd-turbo")?.playground;
    if (!failed) throw new Error("the failed entry keeps its Playground download");
    retryPlaygroundDownload(failed);

    expect(downloadImageModel).toHaveBeenCalledTimes(2);
    expect(useDownloadStore.getState().downloads).toHaveLength(1);
    expect(drawerItem("sd-turbo")?.status).toBe("downloading");
    expect(rowViewOf("sd-turbo")?.error).toBeNull();
    expect(drawerItem("sd-turbo")?.error).toBeUndefined();
  });
});

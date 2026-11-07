import { beforeEach, describe, expect, it } from "vitest";
import type { OcrJob, OcrModel, OcrResult } from "../types";
import { DEFAULT_OCR_COMPUTE } from "../utils/ocr";
import { useOcrStore } from "./ocrStore";

const job = (jobId: string): OcrJob => ({
  jobId,
  modelId: "m",
  startedAt: 0,
  compute: "cpu",
  visionCompute: "npu",
});

const model = (id: string, downloaded = false): OcrModel => ({
  id,
  name: id,
  description: "",
  bestFor: "",
  license: "Apache-2.0",
  licenseUrl: "",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
  sizeBytes: 1,
  downloaded,
  modes: [{ id: "text", label: "Text" }],
});

const result = (jobId: string): OcrResult => ({
  jobId,
  status: "done",
  text: "hello",
  error: null,
  seconds: 2,
  inputName: "a.png",
});

beforeEach(() => {
  useOcrStore.setState({
    models: null,
    selectedModelId: null,
    serverStarting: false,
    mode: "text",
    input: null,
    settings: DEFAULT_OCR_COMPUTE,
    job: null,
    result: null,
  });
});

describe("ocrStore", () => {
  it("defaults to the language model on the CPU and the vision encoder on the NPU", () => {
    expect(useOcrStore.getState().settings).toEqual({ compute: "cpu", visionCompute: "npu" });
  });

  it("selects nothing when the catalog arrives", () => {
    useOcrStore.getState().setModels([model("a"), model("b", true)]);
    expect(useOcrStore.getState().selectedModelId).toBeNull();
  });

  it("keeps a selection while its model is still installed", () => {
    useOcrStore.getState().setModels([model("a"), model("b", true)]);
    useOcrStore.getState().selectModel("b");
    useOcrStore.getState().setModels([model("a"), model("b", true)]);
    expect(useOcrStore.getState().selectedModelId).toBe("b");
  });

  it("clears a selection whose model is listed but no longer installed", () => {
    useOcrStore.getState().setModels([model("a", true)]);
    useOcrStore.getState().selectModel("a");
    useOcrStore.getState().setModels([model("a")]);
    expect(useOcrStore.getState().selectedModelId).toBeNull();
  });

  it("clears the selection on request", () => {
    useOcrStore.getState().setModels([model("a", true)]);
    useOcrStore.getState().selectModel("a");
    useOcrStore.getState().clearModelSelection();
    expect(useOcrStore.getState().selectedModelId).toBeNull();
  });

  it("tracks whether the server is starting", () => {
    useOcrStore.getState().setServerStarting(true);
    expect(useOcrStore.getState().serverStarting).toBe(true);
    useOcrStore.getState().setServerStarting(false);
    expect(useOcrStore.getState().serverStarting).toBe(false);
  });

  it("clears the selection of a deleted model", () => {
    useOcrStore.getState().setModels([model("a", true)]);
    useOcrStore.getState().replaceModelsAfterDelete([model("a")], "a");
    expect(useOcrStore.getState().selectedModelId).toBeNull();
  });

  it("changes one compute choice and keeps the other", () => {
    useOcrStore.getState().setCompute("gpu");
    expect(useOcrStore.getState().settings).toEqual({ compute: "gpu", visionCompute: "npu" });
    useOcrStore.getState().setVisionCompute("cpu");
    expect(useOcrStore.getState().settings).toEqual({ compute: "gpu", visionCompute: "cpu" });
  });

  it("stores the picture size only when a picture is set", () => {
    useOcrStore.getState().setInputSize({ width: 1, height: 2 });
    expect(useOcrStore.getState().input).toBeNull();
    useOcrStore.getState().setInput({ path: "a.png", name: "a.png", sourceSize: null });
    useOcrStore.getState().setInputSize({ width: 1, height: 2 });
    expect(useOcrStore.getState().input?.sourceSize).toEqual({ width: 1, height: 2 });
  });

  it("keeps the compute choices a job started with", () => {
    useOcrStore.getState().startJob(job("j"));
    expect(useOcrStore.getState().job).toMatchObject({ compute: "cpu", visionCompute: "npu" });
  });

  it("starting a job clears the previous result", () => {
    useOcrStore.setState({ result: result("old") });
    useOcrStore.getState().startJob(job("j"));
    expect(useOcrStore.getState().result).toBeNull();
    expect(useOcrStore.getState().job?.jobId).toBe("j");
  });

  it("ignores a result for another job", () => {
    useOcrStore.getState().startJob(job("j"));
    useOcrStore.getState().finishJob(result("other"));
    expect(useOcrStore.getState().job?.jobId).toBe("j");
    useOcrStore.getState().finishJob(result("j"));
    expect(useOcrStore.getState().job).toBeNull();
    expect(useOcrStore.getState().result?.text).toBe("hello");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import type { SpeechJob, SpeechModel, SpeechResult } from "../types";
import { DEFAULT_SPEECH_FORM } from "../utils/speech";
import { useSpeechStore } from "./speechStore";

const model = (id: string, overrides: Partial<SpeechModel> = {}): SpeechModel => ({
  id,
  kind: "stt",
  name: id,
  description: "",
  license: "",
  licenseUrl: "",
  sizeBytes: 0,
  languages: [],
  downloaded: false,
  voices: [],
  ...overrides,
});

const job = (overrides: Partial<SpeechJob> = {}): SpeechJob => ({
  jobId: "job-1",
  kind: "stt",
  modelId: "moonshine",
  startedAt: 0,
  phase: "loading",
  ...overrides,
});

const result = (overrides: Partial<SpeechResult> = {}): SpeechResult => ({
  jobId: "job-1",
  kind: "stt",
  status: "ok",
  text: "hello",
  outputPath: null,
  audioSeconds: 2,
  elapsedSeconds: 0.5,
  error: null,
  ...overrides,
});

beforeEach(() => {
  useSpeechStore.setState({
    models: null,
    selectedModelIds: { stt: null, tts: null },
    audio: null,
    form: DEFAULT_SPEECH_FORM,
    job: null,
    results: { stt: null, tts: null },
  });
});

describe("setModels", () => {
  it("chooses a default for each kind", () => {
    useSpeechStore
      .getState()
      .setModels([
        model("whisper", { downloaded: true }),
        model("kokoro", { kind: "tts", downloaded: true }),
      ]);
    expect(useSpeechStore.getState().selectedModelIds).toEqual({
      stt: "whisper",
      tts: "kokoro",
    });
  });

  it("keeps a selection that is still listed", () => {
    useSpeechStore.setState({ selectedModelIds: { stt: "moonshine", tts: null } });
    useSpeechStore
      .getState()
      .setModels([model("whisper", { downloaded: true }), model("moonshine")]);
    expect(useSpeechStore.getState().selectedModelIds.stt).toBe("moonshine");
  });
});

describe("replaceModelsAfterDelete", () => {
  it("clears only the selection of the deleted model", () => {
    useSpeechStore.setState({ selectedModelIds: { stt: "whisper", tts: "kokoro" } });
    useSpeechStore
      .getState()
      .replaceModelsAfterDelete([model("whisper"), model("kokoro", { kind: "tts" })], "whisper");
    expect(useSpeechStore.getState().selectedModelIds).toEqual({ stt: null, tts: "kokoro" });
  });
});

describe("selectModel", () => {
  it("selects the model for its own kind only", () => {
    useSpeechStore.getState().selectModel(model("kokoro", { kind: "tts" }));
    expect(useSpeechStore.getState().selectedModelIds).toEqual({ stt: null, tts: "kokoro" });
  });
});

describe("setForm", () => {
  it("patches the text to speech form and keeps the rest", () => {
    useSpeechStore.getState().setForm({ text: "Hi" });
    expect(useSpeechStore.getState().form).toEqual({ ...DEFAULT_SPEECH_FORM, text: "Hi" });
  });
});

describe("speech job", () => {
  it("starts a job and clears the previous result of its kind only", () => {
    useSpeechStore.setState({ results: { stt: result(), tts: result({ kind: "tts" }) } });
    useSpeechStore.getState().startJob(job());
    expect(useSpeechStore.getState().job?.jobId).toBe("job-1");
    expect(useSpeechStore.getState().results).toEqual({
      stt: null,
      tts: result({ kind: "tts" }),
    });
  });

  it("moves the job's phase on progress for that job", () => {
    useSpeechStore.setState({ job: job() });
    useSpeechStore.getState().setJobProgress({ jobId: "job-1", phase: "running" });
    expect(useSpeechStore.getState().job?.phase).toBe("running");
  });

  it("ignores progress for another job", () => {
    useSpeechStore.setState({ job: job() });
    useSpeechStore.getState().setJobProgress({ jobId: "other", phase: "saving" });
    expect(useSpeechStore.getState().job?.phase).toBe("loading");
  });

  it("stores the result under its kind and ends the job", () => {
    useSpeechStore.setState({ job: job() });
    useSpeechStore.getState().finishJob(result());
    expect(useSpeechStore.getState().results.stt?.text).toBe("hello");
    expect(useSpeechStore.getState().job).toBeNull();
  });

  it("ignores a result for another job", () => {
    useSpeechStore.setState({ job: job() });
    useSpeechStore.getState().finishJob(result({ jobId: "other" }));
    expect(useSpeechStore.getState().results.stt).toBeNull();
    expect(useSpeechStore.getState().job?.jobId).toBe("job-1");
  });
});

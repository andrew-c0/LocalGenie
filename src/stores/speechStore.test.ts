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
  needsReference: false,
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
  outputs: [],
  audioSeconds: 2,
  elapsedSeconds: 0.5,
  error: null,
  ...overrides,
});

beforeEach(() => {
  useSpeechStore.setState({
    models: null,
    selectedModelIds: { stt: null, tts: null, denoise: null, separate: null },
    audio: null,
    form: DEFAULT_SPEECH_FORM,
    enhanceKind: "denoise",
    job: null,
    results: { stt: null, tts: null, denoise: null, separate: null },
  });
});

describe("setModels", () => {
  it("chooses a default for each kind", () => {
    useSpeechStore
      .getState()
      .setModels([
        model("whisper", { downloaded: true }),
        model("kokoro", { kind: "tts", downloaded: true }),
        model("gtcrn", { kind: "denoise", downloaded: true }),
        model("spleeter", { kind: "separate", downloaded: true }),
      ]);
    expect(useSpeechStore.getState().selectedModelIds).toEqual({
      stt: "whisper",
      tts: "kokoro",
      denoise: "gtcrn",
      separate: "spleeter",
    });
  });

  it("keeps a selection that is still listed", () => {
    useSpeechStore.setState({
      selectedModelIds: { stt: "moonshine", tts: null, denoise: null, separate: null },
    });
    useSpeechStore
      .getState()
      .setModels([model("whisper", { downloaded: true }), model("moonshine")]);
    expect(useSpeechStore.getState().selectedModelIds.stt).toBe("moonshine");
  });
});

describe("replaceModelsAfterDelete", () => {
  it("clears only the selection of the deleted model", () => {
    useSpeechStore.setState({
      selectedModelIds: { stt: "whisper", tts: "kokoro", denoise: "gtcrn", separate: null },
    });
    useSpeechStore
      .getState()
      .replaceModelsAfterDelete([model("whisper"), model("kokoro", { kind: "tts" })], "whisper");
    expect(useSpeechStore.getState().selectedModelIds).toEqual({
      stt: null,
      tts: "kokoro",
      denoise: "gtcrn",
      separate: null,
    });
  });
});

describe("selectModel", () => {
  it("selects the model for its own kind only", () => {
    useSpeechStore.getState().selectModel(model("kokoro", { kind: "tts" }));
    expect(useSpeechStore.getState().selectedModelIds).toEqual({
      stt: null,
      tts: "kokoro",
      denoise: null,
      separate: null,
    });
  });

  it("keeps the clean-up and split selections apart", () => {
    useSpeechStore.getState().selectModel(model("gtcrn", { kind: "denoise" }));
    useSpeechStore.getState().selectModel(model("spleeter", { kind: "separate" }));
    expect(useSpeechStore.getState().selectedModelIds).toEqual({
      stt: null,
      tts: null,
      denoise: "gtcrn",
      separate: "spleeter",
    });
  });
});

describe("setForm", () => {
  it("patches the text to speech form and keeps the rest", () => {
    useSpeechStore.getState().setForm({ text: "Hi" });
    expect(useSpeechStore.getState().form).toEqual({ ...DEFAULT_SPEECH_FORM, text: "Hi" });
  });
});

describe("setEnhanceKind", () => {
  it("switches the audio to audio task and leaves the speech input alone", () => {
    const audio = { audioPath: "/tmp/a.wav", audioName: "a.wav" };
    useSpeechStore.setState({ audio });
    useSpeechStore.getState().setEnhanceKind("separate");
    expect(useSpeechStore.getState().enhanceKind).toBe("separate");
    expect(useSpeechStore.getState().audio).toEqual(audio);
  });
});

describe("speech job", () => {
  it("starts a job and clears the previous result of its kind only", () => {
    useSpeechStore.setState({
      results: {
        stt: result(),
        tts: result({ kind: "tts" }),
        denoise: null,
        separate: result({ kind: "separate" }),
      },
    });
    useSpeechStore.getState().startJob(job());
    expect(useSpeechStore.getState().job?.jobId).toBe("job-1");
    expect(useSpeechStore.getState().results).toEqual({
      stt: null,
      tts: result({ kind: "tts" }),
      denoise: null,
      separate: result({ kind: "separate" }),
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

  it("keeps the saved files of an audio to audio job under its own kind", () => {
    const outputs = [{ label: "Cleaned speech", path: "C:\\out\\output_16k.wav" }];
    useSpeechStore.setState({ job: job({ kind: "denoise" }) });
    useSpeechStore.getState().finishJob(result({ jobId: "job-1", kind: "denoise", outputs }));
    expect(useSpeechStore.getState().results.denoise?.outputs).toEqual(outputs);
    expect(useSpeechStore.getState().results.separate).toBeNull();
  });

  it("ignores a result for another job", () => {
    useSpeechStore.setState({ job: job() });
    useSpeechStore.getState().finishJob(result({ jobId: "other" }));
    expect(useSpeechStore.getState().results.stt).toBeNull();
    expect(useSpeechStore.getState().job?.jobId).toBe("job-1");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import type { SpeechJob, SpeechModel, SpeechResult } from "../types";
import { DEFAULT_SPEECH_FORM } from "../utils/speech";
import { NO_AUDIO_INPUTS, useSpeechStore } from "./speechStore";

const model = (id: string, overrides: Partial<SpeechModel> = {}): SpeechModel => ({
  id,
  kind: "stt",
  name: id,
  description: "",
  license: "",
  licenseUrl: "",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
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
    audios: NO_AUDIO_INPUTS,
    form: DEFAULT_SPEECH_FORM,
    audioTask: "transcribe",
    enhanceKind: "denoise",
    job: null,
    results: { stt: null, tts: null, denoise: null, separate: null },
  });
});

describe("setModels", () => {
  it("selects nothing for any kind when the catalog arrives", () => {
    useSpeechStore
      .getState()
      .setModels([
        model("whisper", { downloaded: true }),
        model("kokoro", { kind: "tts", downloaded: true }),
        model("gtcrn", { kind: "denoise", downloaded: true }),
        model("spleeter", { kind: "separate", downloaded: true }),
      ]);
    expect(useSpeechStore.getState().selectedModelIds).toEqual({
      stt: null,
      tts: null,
      denoise: null,
      separate: null,
    });
  });

  it("keeps a selection while its model is still installed", () => {
    useSpeechStore.setState({
      selectedModelIds: { stt: "moonshine", tts: null, denoise: null, separate: null },
    });
    useSpeechStore
      .getState()
      .setModels([
        model("whisper", { downloaded: true }),
        model("moonshine", { downloaded: true }),
      ]);
    expect(useSpeechStore.getState().selectedModelIds.stt).toBe("moonshine");
  });

  it("clears a selection whose model is no longer installed", () => {
    useSpeechStore.setState({
      selectedModelIds: { stt: "moonshine", tts: null, denoise: null, separate: null },
    });
    useSpeechStore
      .getState()
      .setModels([model("whisper", { downloaded: true }), model("moonshine")]);
    expect(useSpeechStore.getState().selectedModelIds.stt).toBeNull();
  });
});

describe("clearModelSelection", () => {
  it("clears only the selection of the kind given", () => {
    useSpeechStore.setState({
      selectedModelIds: { stt: "whisper", tts: "kokoro", denoise: "gtcrn", separate: null },
    });
    useSpeechStore.getState().clearModelSelection("tts");
    expect(useSpeechStore.getState().selectedModelIds).toEqual({
      stt: "whisper",
      tts: null,
      denoise: "gtcrn",
      separate: null,
    });
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
  it("switches the clean up or split kind and leaves every task's input alone", () => {
    const clip = { audioPath: "/tmp/a.wav", audioName: "a.wav" };
    useSpeechStore.setState({ audios: { ...NO_AUDIO_INPUTS, enhance: clip } });
    useSpeechStore.getState().setEnhanceKind("separate");
    expect(useSpeechStore.getState().enhanceKind).toBe("separate");
    expect(useSpeechStore.getState().audios.enhance).toEqual(clip);
  });
});

describe("setAudio", () => {
  const clip = { audioPath: "/tmp/a.wav", audioName: "a.wav" };

  it("gives the clip to the task it is chosen for, and leaves the other tasks empty", () => {
    useSpeechStore.getState().setAudio("transcribe", clip);
    expect(useSpeechStore.getState().audios).toEqual({
      transcribe: clip,
      speak: null,
      enhance: null,
    });
  });

  it("keeps the other tasks' clips when one task's clip changes", () => {
    const other = { audioPath: "/tmp/b.wav", audioName: "b.wav" };
    useSpeechStore.setState({ audios: { transcribe: clip, speak: null, enhance: other } });
    useSpeechStore.getState().setAudio("transcribe", null);
    expect(useSpeechStore.getState().audios).toEqual({
      transcribe: null,
      speak: null,
      enhance: other,
    });
  });
});

describe("takeAsInput", () => {
  const output = { audioPath: "/music/speech.wav", audioName: "speech.wav" };

  it("sets only the target task's input and switches to that task", () => {
    useSpeechStore.setState({
      audioTask: "speak",
      audios: {
        transcribe: { audioPath: "/tmp/mine.wav", audioName: "mine.wav" },
        speak: null,
        enhance: null,
      },
    });
    useSpeechStore.getState().takeAsInput("transcribe", output);
    const state = useSpeechStore.getState();
    expect(state.audioTask).toBe("transcribe");
    expect(state.audios.transcribe).toEqual(output);
    expect(state.audios.enhance).toBeNull();
    expect(state.audios.speak).toBeNull();
  });

  it("leaves the input of the task it came from alone", () => {
    const speakClip = { audioPath: "/tmp/ref.wav", audioName: "ref.wav" };
    useSpeechStore.setState({
      audioTask: "speak",
      audios: { ...NO_AUDIO_INPUTS, speak: speakClip },
    });
    useSpeechStore.getState().takeAsInput("enhance", output);
    expect(useSpeechStore.getState().audios.speak).toEqual(speakClip);
    expect(useSpeechStore.getState().audios.enhance).toEqual(output);
  });
});

describe("setAudioTask", () => {
  it("starts on speech to text", () => {
    expect(useSpeechStore.getState().audioTask).toBe("transcribe");
  });

  it("switches the task and keeps the shared input and every other task's result", () => {
    const clip = { audioPath: "/tmp/a.wav", audioName: "a.wav" };
    useSpeechStore.setState({
      audios: { ...NO_AUDIO_INPUTS, transcribe: clip },
      results: { stt: result(), tts: result({ kind: "tts" }), denoise: null, separate: null },
    });
    useSpeechStore.getState().setAudioTask("speak");
    const state = useSpeechStore.getState();
    expect(state.audioTask).toBe("speak");
    expect(state.audios.transcribe).toEqual(clip);
    expect(state.results.stt?.text).toBe("hello");
    expect(state.results.tts?.kind).toBe("tts");
  });

  it("does not stop a running job when the task changes", () => {
    useSpeechStore.setState({ job: job() });
    useSpeechStore.getState().setAudioTask("enhance");
    expect(useSpeechStore.getState().job?.jobId).toBe("job-1");
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

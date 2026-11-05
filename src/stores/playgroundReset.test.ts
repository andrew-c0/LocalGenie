import { describe, expect, it } from "vitest";
import type {
  ImageForm,
  ImageJob,
  ImageResult,
  InputImage,
  OcrJob,
  OcrResult,
  SpeechJob,
  SpeechResult,
} from "../types";
import { DEFAULT_IMAGE_FORM } from "../utils/playground";
import { useOcrStore } from "./ocrStore";
import { usePlaygroundStore } from "./playgroundStore";
import { useSpeechStore } from "./speechStore";

const picture = (path: string): InputImage => ({ path, name: "a.png", sourceSize: null });

const textResult: ImageResult = {
  jobId: "text-1",
  kind: "generate",
  status: "done",
  path: "C:/out/text.png",
  error: null,
  seed: 1,
  seconds: 2,
  device: "cpu",
  inputPath: null,
};

const editResult: ImageResult = { ...textResult, jobId: "edit-1", inputPath: "C:/in/a.png" };
const upscaleResult: ImageResult = {
  ...textResult,
  jobId: "up-1",
  kind: "upscale",
  inputPath: "C:/in/b.png",
};

const textJob: ImageJob = {
  jobId: "text-2",
  kind: "generate",
  modelId: "m",
  device: "auto",
  inputPath: null,
  startedAt: 0,
  phase: "loading",
  step: 0,
  steps: 4,
  secondsPerStep: null,
};

const editJob: ImageJob = { ...textJob, jobId: "edit-2", inputPath: "C:/in/a.png" };

const form: ImageForm = { ...DEFAULT_IMAGE_FORM, prompt: "keep me" };

function seedImages(result: ImageResult | null, job: ImageJob | null, extra: object = {}) {
  usePlaygroundStore.setState({
    form,
    strength: 0.4,
    inputImage: picture("C:/in/a.png"),
    upscaleInput: picture("C:/in/b.png"),
    result,
    job,
    ...extra,
  });
}

describe("image tool resets", () => {
  it("text to image clears its finished result and keeps the form", () => {
    seedImages(textResult, null);
    usePlaygroundStore.getState().resetTextToImageWork();
    expect(usePlaygroundStore.getState().result).toBeNull();
    expect(usePlaygroundStore.getState().form.prompt).toBe("keep me");
  });

  it("text to image leaves an edit result in the shared slot alone", () => {
    seedImages(editResult, null);
    usePlaygroundStore.getState().resetTextToImageWork();
    expect(usePlaygroundStore.getState().result).toBe(editResult);
  });

  it("image to image clears its picture and edit result, and keeps text and upscale work", () => {
    seedImages(editResult, null);
    usePlaygroundStore.getState().resetImageToImageWork();
    const state = usePlaygroundStore.getState();
    expect(state.inputImage).toBeNull();
    expect(state.result).toBeNull();
    expect(state.upscaleInput?.path).toBe("C:/in/b.png");
    expect(state.strength).toBe(0.4);
  });

  it("image to image keeps its picture while its own edit runs", () => {
    seedImages(null, editJob);
    usePlaygroundStore.getState().resetImageToImageWork();
    expect(usePlaygroundStore.getState().inputImage?.path).toBe("C:/in/a.png");
    expect(usePlaygroundStore.getState().job).toBe(editJob);
  });

  it("the text reset does not clear the image to image input, so Use as input survives", () => {
    seedImages(textResult, null);
    usePlaygroundStore.getState().resetTextToImageWork();
    expect(usePlaygroundStore.getState().inputImage?.path).toBe("C:/in/a.png");
  });

  it("upscaling clears its picture and result, and keeps the image to image input", () => {
    seedImages(upscaleResult, null);
    usePlaygroundStore.getState().resetUpscaleWork();
    const state = usePlaygroundStore.getState();
    expect(state.upscaleInput).toBeNull();
    expect(state.result).toBeNull();
    expect(state.inputImage?.path).toBe("C:/in/a.png");
  });

  it("a running text job is not touched by its reset", () => {
    seedImages(null, textJob);
    usePlaygroundStore.getState().resetTextToImageWork();
    expect(usePlaygroundStore.getState().job).toBe(textJob);
  });
});

describe("OCR reset", () => {
  const ocrJob: OcrJob = {
    jobId: "ocr-1",
    modelId: "m",
    startedAt: 0,
    compute: "cpu",
    visionCompute: "npu",
  };
  const ocrResult: OcrResult = {
    jobId: "ocr-1",
    status: "done",
    text: "hello",
    error: null,
    seconds: 1,
    inputName: "a.png",
  };

  it("clears the picture and the text, and keeps the mode and compute choices", () => {
    useOcrStore.setState({
      input: picture("C:/in/a.png"),
      result: ocrResult,
      job: null,
      mode: "table",
      settings: { compute: "gpu", visionCompute: "cpu" },
    });
    useOcrStore.getState().resetOcrWork();
    const state = useOcrStore.getState();
    expect(state.input).toBeNull();
    expect(state.result).toBeNull();
    expect(state.mode).toBe("table");
    expect(state.settings).toEqual({ compute: "gpu", visionCompute: "cpu" });
  });

  it("keeps the picture while an OCR job runs", () => {
    useOcrStore.setState({ input: picture("C:/in/a.png"), result: null, job: ocrJob });
    useOcrStore.getState().resetOcrWork();
    expect(useOcrStore.getState().input?.path).toBe("C:/in/a.png");
  });
});

describe("speech reset", () => {
  const sttResult: SpeechResult = {
    jobId: "s1",
    kind: "stt",
    status: "ok",
    text: "words",
    outputPath: null,
    outputs: [],
    audioSeconds: 3,
    elapsedSeconds: 1,
    error: null,
  };
  const ttsResult: SpeechResult = {
    ...sttResult,
    jobId: "t1",
    kind: "tts",
    text: null,
    outputPath: "C:/o.wav",
  };
  const audio = { audioPath: "C:/rec.wav", audioName: "rec.wav" };

  function seedSpeech(job: SpeechJob | null = null) {
    useSpeechStore.setState({
      audio,
      results: { stt: sttResult, tts: ttsResult, denoise: null, separate: null },
      job,
    });
  }

  it("clears its own results and the audio when the user leaves for another tool", () => {
    seedSpeech();
    useSpeechStore.getState().resetSpeechWork("playground-speech-to-text", false);
    const state = useSpeechStore.getState();
    expect(state.results.stt).toBeNull();
    expect(state.results.tts).toBe(ttsResult);
    expect(state.audio).toBeNull();
  });

  it("keeps the audio when the user moves to another speech tool", () => {
    seedSpeech();
    useSpeechStore.getState().resetSpeechWork("playground-speech-to-text", true);
    expect(useSpeechStore.getState().audio).toEqual(audio);
  });

  it("keeps the audio while a speech job still reads it", () => {
    const job: SpeechJob = {
      jobId: "t2",
      kind: "tts",
      modelId: "m",
      startedAt: 0,
      phase: "loading",
    };
    seedSpeech(job);
    useSpeechStore.getState().resetSpeechWork("playground-speech-to-text", false);
    expect(useSpeechStore.getState().audio).toEqual(audio);
    expect(useSpeechStore.getState().job).toBe(job);
  });
});

import { describe, expect, it } from "vitest";
import type {
  PlaygroundSpeechDone,
  SpeechForm,
  SpeechKind,
  SpeechModel,
  SpeechVoice,
} from "../types";
import {
  audioJobBlockedReason,
  buildSynthesizeRequest,
  buildTranscribeRequest,
  clearDeletedSelection,
  defaultSpeechModel,
  failedSpeechResult,
  fileNameOf,
  isWavPath,
  keepSpeechSelection,
  recordingName,
  resolveVoiceId,
  sortVoices,
  speechModelsOfKind,
  speechResultOf,
  speechTimingLabel,
  synthesizeBlockedReason,
  voiceGroup,
  voiceOptions,
} from "./speech";

const model = (overrides: Partial<SpeechModel> = {}): SpeechModel => ({
  id: "whisper-tiny-en",
  kind: "stt",
  name: "Whisper tiny.en",
  description: "Small English recogniser",
  license: "MIT",
  licenseUrl: "https://example.com/license",
  sizeBytes: 40_000_000,
  languages: ["en"],
  downloaded: true,
  voices: [],
  ...overrides,
});

const tts = (overrides: Partial<SpeechModel> = {}): SpeechModel =>
  model({
    id: "kokoro",
    kind: "tts",
    name: "Kokoro",
    languages: ["en-us", "en-gb"],
    voices: [],
    ...overrides,
  });

const denoise = (overrides: Partial<SpeechModel> = {}): SpeechModel =>
  model({
    id: "gtcrn-simple",
    kind: "denoise",
    name: "GTCRN simple",
    languages: [],
    ...overrides,
  });

const separate = (overrides: Partial<SpeechModel> = {}): SpeechModel =>
  model({
    id: "spleeter-2stems-int8",
    kind: "separate",
    name: "Spleeter 2 stems int8",
    languages: [],
    ...overrides,
  });

const voice = (id: number, label: string): SpeechVoice => ({
  id,
  name: label.split(" (")[0],
  label,
});

const VOICES: SpeechVoice[] = [
  voice(3, "Heart (US female)"),
  voice(10, "Adam (US male)"),
  voice(20, "Emma (UK female)"),
  voice(30, "Narrator"),
];

const form = (overrides: Partial<SpeechForm> = {}): SpeechForm => ({
  text: "Hello there",
  voiceId: 3,
  speed: 1,
  ...overrides,
});

describe("speech model selection", () => {
  const catalog = [
    model({ id: "whisper", downloaded: false }),
    model({ id: "moonshine", downloaded: true }),
    tts({ id: "kokoro", downloaded: false }),
    denoise({ id: "gtcrn", downloaded: true }),
    separate({ id: "spleeter", downloaded: false }),
  ];

  it("falls back to the first downloaded model of the kind, else the first listed", () => {
    expect(defaultSpeechModel(catalog, "stt")?.id).toBe("moonshine");
    expect(defaultSpeechModel(catalog, "tts")?.id).toBe("kokoro");
    expect(defaultSpeechModel(catalog, "denoise")?.id).toBe("gtcrn");
    expect(defaultSpeechModel(catalog, "separate")?.id).toBe("spleeter");
    expect(defaultSpeechModel([model({ downloaded: false })], "stt")?.downloaded).toBe(false);
    expect(defaultSpeechModel([], "tts")).toBeNull();
  });

  it("keeps each kind's selection while its model is still listed", () => {
    const next = keepSpeechSelection(
      { stt: "whisper", tts: "kokoro", denoise: "gtcrn", separate: "spleeter" },
      catalog,
    );
    expect(next).toEqual({
      stt: "whisper",
      tts: "kokoro",
      denoise: "gtcrn",
      separate: "spleeter",
    });
  });

  it("falls back for a kind whose selected model is gone", () => {
    const next = keepSpeechSelection(
      { stt: "gone", tts: null, denoise: null, separate: "gone" },
      catalog,
    );
    expect(next).toEqual({
      stt: "moonshine",
      tts: "kokoro",
      denoise: "gtcrn",
      separate: "spleeter",
    });
  });

  it("does not select a model of another kind", () => {
    const next = keepSpeechSelection(
      { stt: "kokoro", tts: "gtcrn", denoise: "moonshine", separate: "kokoro" },
      catalog,
    );
    expect(next.stt).toBe("moonshine");
    expect(next.tts).toBe("kokoro");
    expect(next.denoise).toBe("gtcrn");
    expect(next.separate).toBe("spleeter");
  });

  it("clears only the selection of the deleted model", () => {
    const next = clearDeletedSelection(
      { stt: "moonshine", tts: "kokoro", denoise: "gtcrn", separate: "spleeter" },
      "gtcrn",
    );
    expect(next).toEqual({ stt: "moonshine", tts: "kokoro", denoise: null, separate: "spleeter" });
  });
});

describe("speechModelsOfKind", () => {
  const catalog = [
    model({ id: "whisper" }),
    tts({ id: "kokoro" }),
    denoise({ id: "gtcrn" }),
    denoise({ id: "dpdfnet4" }),
    separate({ id: "spleeter" }),
  ];

  it("lists only the models of the tab's kind", () => {
    expect(speechModelsOfKind(catalog, "denoise").map((m) => m.id)).toEqual(["gtcrn", "dpdfnet4"]);
    expect(speechModelsOfKind(catalog, "separate").map((m) => m.id)).toEqual(["spleeter"]);
  });

  it("keeps the audio to audio models out of the speech to text and text to speech lists", () => {
    const sttAndTts: SpeechKind[] = ["stt", "tts"];
    for (const kind of sttAndTts) {
      const ids = speechModelsOfKind(catalog, kind).map((m) => m.id);
      expect(ids).not.toContain("gtcrn");
      expect(ids).not.toContain("dpdfnet4");
      expect(ids).not.toContain("spleeter");
    }
    expect(speechModelsOfKind(catalog, "stt").map((m) => m.id)).toEqual(["whisper"]);
    expect(speechModelsOfKind(catalog, "tts").map((m) => m.id)).toEqual(["kokoro"]);
  });
});

describe("voices", () => {
  it("takes the group from the brackets in the label", () => {
    expect(voiceGroup("Heart (US female)")).toBe("US female");
    expect(voiceGroup("Narrator")).toBe("Other");
  });

  it("sorts by group, then by name", () => {
    const names = sortVoices(VOICES).map((v) => v.name);
    // Groups: "Other", "UK female", "US female", "US male".
    expect(names).toEqual(["Narrator", "Emma", "Heart", "Adam"]);
  });

  it("builds dropdown options with the id as value and the group as description", () => {
    const options = voiceOptions(VOICES);
    expect(options[1]).toEqual({
      value: "20",
      label: "Emma",
      selectedLabel: "Emma (UK female)",
      description: "UK female",
    });
  });

  it("keeps a selected voice the model still has", () => {
    expect(resolveVoiceId(10, VOICES)).toBe(10);
  });

  it("starts on Heart when nothing is selected", () => {
    expect(resolveVoiceId(null, VOICES)).toBe(3);
  });

  it("falls back to the first voice in list order when Heart is absent", () => {
    expect(resolveVoiceId(null, [voice(10, "Adam (US male)"), voice(30, "Narrator")])).toBe(30);
  });

  it("is null for a model with no voices", () => {
    expect(resolveVoiceId(null, [])).toBeNull();
  });

  it("replaces a selected voice the model does not have", () => {
    expect(resolveVoiceId(999, VOICES)).toBe(3);
  });
});

describe("speechTimingLabel", () => {
  it("names the time taken and the audio length", () => {
    expect(speechTimingLabel(2.34, 10)).toBe("Took 2.3 s for 10.0 s of audio.");
  });

  it("leaves out the audio length when it is not known", () => {
    expect(speechTimingLabel(0.5, null)).toBe("Took 0.5 s.");
  });

  it("is null when the time is not known", () => {
    expect(speechTimingLabel(null, 4)).toBeNull();
  });
});

describe("audio paths", () => {
  it("recognises a WAV file by extension, in any case", () => {
    expect(isWavPath("C:\\clips\\hello.wav")).toBe(true);
    expect(isWavPath("/tmp/HELLO.WAV")).toBe(true);
    expect(isWavPath("clip.mp3")).toBe(false);
    expect(isWavPath("wav")).toBe(false);
  });

  it("takes the file name from a Windows or POSIX path", () => {
    expect(fileNameOf("C:\\clips\\hello.wav")).toBe("hello.wav");
    expect(fileNameOf("/tmp/hello.wav")).toBe("hello.wav");
    expect(fileNameOf("hello.wav")).toBe("hello.wav");
  });

  it("names a recording by its length", () => {
    expect(recordingName(12.4)).toBe("Recording (0:12)");
    expect(recordingName(65)).toBe("Recording (1:05)");
  });
});

describe("audioJobBlockedReason", () => {
  const ready = {
    runtime: "installed" as const,
    model: model(),
    audioPath: "C:\\clips\\hello.wav",
    jobRunning: false,
  };

  it("is null when the job can run", () => {
    expect(audioJobBlockedReason(ready)).toBeNull();
  });

  it("names the runtime when it is missing", () => {
    expect(audioJobBlockedReason({ ...ready, runtime: "missing" })).toBe(
      "Install sherpa-onnx in Settings > Runtimes first.",
    );
  });

  it("asks for a model, a download and audio, in that order", () => {
    expect(audioJobBlockedReason({ ...ready, model: null })).toBe("Choose a model first.");
    expect(audioJobBlockedReason({ ...ready, model: model({ downloaded: false }) })).toBe(
      "Download the model first.",
    );
    expect(audioJobBlockedReason({ ...ready, audioPath: null })).toBe(
      "Choose a .wav file or record one first.",
    );
  });

  it("blocks while a speech job runs", () => {
    expect(audioJobBlockedReason({ ...ready, jobRunning: true })).toBe(
      "A speech job is already running.",
    );
  });

  it("applies the same gate to a clean-up or split model", () => {
    expect(audioJobBlockedReason({ ...ready, model: denoise({ downloaded: false }) })).toBe(
      "Download the model first.",
    );
    expect(audioJobBlockedReason({ ...ready, model: separate() })).toBeNull();
  });
});

describe("synthesizeBlockedReason", () => {
  const ready = {
    runtime: "installed" as const,
    model: tts(),
    text: "Hello there",
    voiceId: 3,
    jobRunning: false,
  };

  it("is null when the job can run", () => {
    expect(synthesizeBlockedReason(ready)).toBeNull();
  });

  it("asks for text when it is blank", () => {
    expect(synthesizeBlockedReason({ ...ready, text: "   " })).toBe("Write some text first.");
  });

  it("asks for a voice when the model has none picked", () => {
    expect(synthesizeBlockedReason({ ...ready, voiceId: null })).toBe("Choose a voice first.");
  });

  it("checks the runtime before the model", () => {
    expect(synthesizeBlockedReason({ ...ready, runtime: "checking", model: null })).toBe(
      "Checking the runtime…",
    );
  });
});

describe("request builders", () => {
  it("sends the model, the file and the job id for a transcription", () => {
    expect(
      buildTranscribeRequest("job-1", model(), { audioPath: "/tmp/a.wav", audioName: "a.wav" }),
    ).toEqual({ jobId: "job-1", modelId: "whisper-tiny-en", audioPath: "/tmp/a.wav" });
  });

  it("sends the trimmed text and the chosen voice and speed for a synthesis", () => {
    expect(
      buildSynthesizeRequest("job-2", tts(), form({ text: "  Hi there  ", speed: 1.5 }), 3),
    ).toEqual({
      jobId: "job-2",
      modelId: "kokoro",
      text: "Hi there",
      voiceId: 3,
      speed: 1.5,
    });
  });
});

describe("failedSpeechResult", () => {
  it("is an error result with nothing to show but the reason", () => {
    expect(failedSpeechResult("job-3", "tts", "No runtime")).toEqual({
      jobId: "job-3",
      kind: "tts",
      status: "error",
      text: null,
      outputPath: null,
      outputs: [],
      audioSeconds: null,
      elapsedSeconds: null,
      error: "No runtime",
    });
  });
});

describe("speechResultOf", () => {
  const done = (overrides: Partial<PlaygroundSpeechDone> = {}): PlaygroundSpeechDone => ({
    jobId: "job-4",
    kind: "separate",
    status: "ok",
    ...overrides,
  });

  it("keeps the outputs of an audio to audio job in the order the backend sent them", () => {
    const outputs = [
      { label: "Voice", path: "C:\\out\\voice.wav" },
      { label: "Music and other sounds", path: "C:\\out\\accompaniment.wav" },
    ];
    const result = speechResultOf(done({ outputs }));
    expect(result.outputs).toEqual(outputs);
    expect(result.kind).toBe("separate");
    expect(result.status).toBe("ok");
  });

  it("has no outputs when the event leaves them out", () => {
    expect(speechResultOf(done({ kind: "stt", text: "hi" })).outputs).toEqual([]);
  });

  it("fills the missing optional fields with null", () => {
    expect(speechResultOf(done({ status: "cancelled" }))).toEqual({
      jobId: "job-4",
      kind: "separate",
      status: "cancelled",
      text: null,
      outputPath: null,
      outputs: [],
      audioSeconds: null,
      elapsedSeconds: null,
      error: null,
    });
  });
});

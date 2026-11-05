import { describe, expect, it } from "vitest";
import type { AudioTask, SpeechModel, SpeechResult } from "../types";
import {
  AUDIO_TASK_PARAM,
  type AudioTaskGate,
  audioTaskBlockedReason,
  audioTaskFromParam,
  audioTaskUrl,
  DEFAULT_AUDIO_TASK,
  savedPathOf,
  speechKindOfTask,
} from "./audioTask";
import { REFERENCE_REQUIRED_MESSAGE } from "./speechText";

const TASKS: AudioTask[] = ["transcribe", "speak", "enhance"];

const model = (overrides: Partial<SpeechModel> = {}): SpeechModel => ({
  id: "model",
  kind: "stt",
  name: "Model",
  description: "",
  license: "",
  licenseUrl: "",
  sizeBytes: 1,
  languages: [],
  downloaded: true,
  voices: [],
  needsReference: false,
  ...overrides,
});

const result = (overrides: Partial<SpeechResult> = {}): SpeechResult => ({
  jobId: "job-1",
  kind: "tts",
  status: "ok",
  text: null,
  outputPath: null,
  outputs: [],
  audioSeconds: null,
  elapsedSeconds: null,
  error: null,
  ...overrides,
});

/** A gate where every check passes for speaking with a built-in voice. */
const ready: AudioTaskGate = {
  runtime: "installed",
  model: model({ kind: "tts" }),
  audioPath: "C:/clips/a.wav",
  text: "Hello",
  voiceId: 0,
  jobRunning: false,
};

describe("audioTaskFromParam and audioTaskUrl", () => {
  it("opens on speech to text by default", () => {
    expect(DEFAULT_AUDIO_TASK).toBe("transcribe");
  });

  it("reads a known task from the query value, and gives null for anything else", () => {
    expect(audioTaskFromParam("speak")).toBe("speak");
    expect(audioTaskFromParam("enhance")).toBe("enhance");
    expect(audioTaskFromParam("speech-to-text")).toBeNull();
    expect(audioTaskFromParam("")).toBeNull();
    expect(audioTaskFromParam(null)).toBeNull();
  });

  it("builds the Audio address with the task as the query value, which reads back to the same task", () => {
    expect(audioTaskUrl("speak")).toBe("/playground/audio?task=speak");
    for (const task of TASKS) {
      const query = audioTaskUrl(task).split("?")[1] ?? "";
      expect(audioTaskFromParam(new URLSearchParams(query).get(AUDIO_TASK_PARAM))).toBe(task);
    }
  });

  it("maps the old speech pages to their tasks", () => {
    expect(audioTaskUrl("transcribe")).toBe("/playground/audio?task=transcribe");
    expect(audioTaskUrl("speak")).toBe("/playground/audio?task=speak");
    expect(audioTaskUrl("enhance")).toBe("/playground/audio?task=enhance");
  });
});

describe("speechKindOfTask", () => {
  it("runs speech to text as stt and text to speech as tts", () => {
    expect(speechKindOfTask("transcribe", "denoise")).toBe("stt");
    expect(speechKindOfTask("speak", "separate")).toBe("tts");
  });

  it("runs the enhance task on the kind it is set to", () => {
    expect(speechKindOfTask("enhance", "denoise")).toBe("denoise");
    expect(speechKindOfTask("enhance", "separate")).toBe("separate");
  });
});

describe("savedPathOf", () => {
  it("gives the wav a speech saved", () => {
    expect(savedPathOf(result({ outputPath: "C:/Music/LocalGenie/speech.wav" }))).toBe(
      "C:/Music/LocalGenie/speech.wav",
    );
  });

  it("gives the first file of a clean up or split", () => {
    const outputs = [
      { label: "Voice", path: "C:/Music/LocalGenie/voice.wav" },
      { label: "Music", path: "C:/Music/LocalGenie/music.wav" },
    ];
    expect(savedPathOf(result({ kind: "separate", outputs }))).toBe(
      "C:/Music/LocalGenie/voice.wav",
    );
  });

  it("is null for no result, a failed or cancelled job, and a transcript with no file", () => {
    expect(savedPathOf(null)).toBeNull();
    expect(savedPathOf(result({ status: "error", outputPath: "C:/a.wav" }))).toBeNull();
    expect(savedPathOf(result({ status: "cancelled", outputPath: "C:/a.wav" }))).toBeNull();
    expect(savedPathOf(result({ kind: "stt", text: "words" }))).toBeNull();
  });
});

describe("audioTaskBlockedReason", () => {
  it("lets each task run when its model, input and runtime are ready", () => {
    expect(audioTaskBlockedReason("speak", ready)).toBeNull();
    expect(
      audioTaskBlockedReason("transcribe", {
        ...ready,
        model: model({ kind: "stt" }),
      }),
    ).toBeNull();
    expect(
      audioTaskBlockedReason("enhance", {
        ...ready,
        model: model({ kind: "denoise" }),
      }),
    ).toBeNull();
  });

  it("stops every task while a speech job runs, whichever task it is", () => {
    for (const task of TASKS) {
      expect(audioTaskBlockedReason(task, { ...ready, jobRunning: true })).toBe(
        "A speech job is already running.",
      );
    }
  });

  it("asks for a model first, for every task", () => {
    for (const task of TASKS) {
      expect(audioTaskBlockedReason(task, { ...ready, model: null })).toBe("Choose a model first.");
    }
  });

  it("asks for the model's download before it runs", () => {
    expect(
      audioTaskBlockedReason("transcribe", { ...ready, model: model({ downloaded: false }) }),
    ).toBe("Download the model first.");
  });

  it("asks for an input audio for transcribe and enhance", () => {
    const noAudio = { ...ready, audioPath: null };
    expect(audioTaskBlockedReason("transcribe", noAudio)).toBe(
      "Choose a .wav file or record one first.",
    );
    expect(audioTaskBlockedReason("enhance", noAudio)).toBe(
      "Choose a .wav file or record one first.",
    );
  });

  it("asks for text and a voice for speak", () => {
    expect(audioTaskBlockedReason("speak", { ...ready, text: "   " })).toBe(
      "Write some text first.",
    );
    expect(audioTaskBlockedReason("speak", { ...ready, voiceId: null })).toBe(
      "Choose a voice first.",
    );
  });

  it("asks for a reference clip, not a voice, when the speaking model copies a voice", () => {
    const cloning = {
      ...ready,
      model: model({ kind: "tts", needsReference: true }),
      voiceId: null,
    };
    expect(audioTaskBlockedReason("speak", { ...cloning, audioPath: null })).toBe(
      REFERENCE_REQUIRED_MESSAGE,
    );
    expect(audioTaskBlockedReason("speak", cloning)).toBeNull();
  });

  it("stops every task while the runtime is missing", () => {
    for (const task of TASKS) {
      expect(audioTaskBlockedReason(task, { ...ready, runtime: "missing" })).not.toBeNull();
    }
  });
});

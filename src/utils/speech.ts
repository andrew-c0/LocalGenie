import type {
  PlaygroundSpeechDone,
  SpeechAudioInput,
  SpeechForm,
  SpeechKind,
  SpeechModel,
  SpeechResult,
  SpeechSynthesizeRequest,
  SpeechTranscribeRequest,
  SpeechVoice,
} from "../types";
import type { RuntimeStatus } from "./playground";
import { formatElapsed, runtimeBlockedReason } from "./playground";
import { REFERENCE_REQUIRED_MESSAGE } from "./speechText";

/** Runtime id of sherpa-onnx in the runtime registry. Speech to text and text to speech both run on it. */
export const SHERPA_RUNTIME_ID = "sherpa-onnx";
/** The name sherpa-onnx goes by in messages. */
export const SHERPA_NAME = "sherpa-onnx";

/** Sample rate the speech to text models read. Recordings are resampled to it before they are saved. */
export const STT_SAMPLE_RATE = 16000;

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;
export const SPEED_STEP = 0.1;
export const SPEED_DEFAULT = 1;

/** The voice a text to speech model starts on when the form has none. */
export const DEFAULT_VOICE_NAME = "Heart";
const OTHER_VOICE_GROUP = "Other";

/** Starting form before a voice is picked. The voice id is resolved from the selected model. */
export const DEFAULT_SPEECH_FORM: SpeechForm = {
  text: "",
  voiceId: null,
  speed: SPEED_DEFAULT,
};

/** The selected model of each speech tab, by kind. Null when none is selected. */
export type SpeechSelection = Record<SpeechKind, string | null>;

/** Nothing selected for any kind. */
export const NO_SPEECH_SELECTION: SpeechSelection = {
  stt: null,
  tts: null,
  denoise: null,
  separate: null,
};

/** The models of one kind, in the order the catalog lists them. */
export function speechModelsOfKind(models: SpeechModel[], kind: SpeechKind): SpeechModel[] {
  return models.filter((model) => model.kind === kind);
}

/** The model a selection of one kind falls back to: the first downloaded one, else the first listed. */
export function defaultSpeechModel(models: SpeechModel[], kind: SpeechKind): SpeechModel | null {
  const ofKind = speechModelsOfKind(models, kind);
  return ofKind.find((model) => model.downloaded) ?? ofKind[0] ?? null;
}

function keepOneSelection(
  current: string | null,
  models: SpeechModel[],
  kind: SpeechKind,
): string | null {
  if (current && models.some((model) => model.id === current && model.kind === kind)) {
    return current;
  }
  return defaultSpeechModel(models, kind)?.id ?? null;
}

/** The selections after the catalog changes. A selection stays while its model is still listed, else falls back to the kind's default. */
export function keepSpeechSelection(
  selected: SpeechSelection,
  models: SpeechModel[],
): SpeechSelection {
  return {
    stt: keepOneSelection(selected.stt, models, "stt"),
    tts: keepOneSelection(selected.tts, models, "tts"),
    denoise: keepOneSelection(selected.denoise, models, "denoise"),
    separate: keepOneSelection(selected.separate, models, "separate"),
  };
}

/** The selections with a deleted model cleared. No default is chosen, as for image models. */
export function clearDeletedSelection(
  selected: SpeechSelection,
  deletedModelId: string,
): SpeechSelection {
  return {
    stt: selected.stt === deletedModelId ? null : selected.stt,
    tts: selected.tts === deletedModelId ? null : selected.tts,
    denoise: selected.denoise === deletedModelId ? null : selected.denoise,
    separate: selected.separate === deletedModelId ? null : selected.separate,
  };
}

/** The group a voice names in brackets: "US female" for "Heart (US female)". A voice without brackets is "Other". */
export function voiceGroup(label: string): string {
  const match = /\(([^()]*)\)\s*$/.exec(label);
  return match?.[1]?.trim() || OTHER_VOICE_GROUP;
}

/** The voices in list order: by group (accent and gender), then by name. */
export function sortVoices(voices: SpeechVoice[]): SpeechVoice[] {
  return [...voices].sort(
    (a, b) =>
      voiceGroup(a.label).localeCompare(voiceGroup(b.label)) || a.name.localeCompare(b.name),
  );
}

export interface VoiceOption {
  value: string;
  /** The voice's name, as the list shows it. */
  label: string;
  /** The full label, as the field shows it once picked. */
  selectedLabel: string;
  /** The group, under the name in the list. */
  description: string;
}

/** The voice dropdown options, in list order. Each option's value is the voice id as text. */
export function voiceOptions(voices: SpeechVoice[]): VoiceOption[] {
  return sortVoices(voices).map((voice) => ({
    value: String(voice.id),
    label: voice.name,
    selectedLabel: voice.label,
    description: voiceGroup(voice.label),
  }));
}

/** The voice to use: the selected id when the model still has it, else the default voice, else the first in list order. Null for a model with no voices. */
export function resolveVoiceId(selected: number | null, voices: SpeechVoice[]): number | null {
  if (selected !== null && voices.some((voice) => voice.id === selected)) return selected;
  const sorted = sortVoices(voices);
  return (sorted.find((voice) => voice.name === DEFAULT_VOICE_NAME) ?? sorted[0])?.id ?? null;
}

/** "Took 2.3 s for 10.0 s of audio." Without the audio length: "Took 2.3 s." Null when the time is not known. */
export function speechTimingLabel(
  elapsedSeconds: number | null,
  audioSeconds: number | null,
): string | null {
  if (elapsedSeconds === null) return null;
  const took = `Took ${elapsedSeconds.toFixed(1)} s`;
  if (audioSeconds === null) return `${took}.`;
  return `${took} for ${audioSeconds.toFixed(1)} s of audio.`;
}

/** True when the path names a WAV file, by its extension. */
export function isWavPath(path: string): boolean {
  return path.toLowerCase().endsWith(".wav");
}

/** The file name at the end of a path, for either slash style. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** The name of a recording in the panel: "Recording (0:12)" for a recording of 12 seconds. */
export function recordingName(seconds: number): string {
  return `Recording (${formatElapsed(seconds * 1000)})`;
}

interface AudioJobGate {
  runtime: RuntimeStatus;
  model: SpeechModel | null;
  audioPath: string | null;
  jobRunning: boolean;
}

/** What stops a job that reads an audio input (Transcribe, Run on the audio to audio tab) from starting, in the order the user can fix it. Null when it can run. */
export function audioJobBlockedReason(gate: AudioJobGate): string | null {
  if (gate.jobRunning) return "A speech job is already running.";
  const runtimeReason = runtimeBlockedReason(gate.runtime, SHERPA_NAME);
  if (runtimeReason) return runtimeReason;
  if (!gate.model) return "Choose a model first.";
  if (!gate.model.downloaded) return "Download the model first.";
  if (!gate.audioPath) return "Choose a .wav file or record one first.";
  return null;
}

interface SynthesizeGate {
  runtime: RuntimeStatus;
  model: SpeechModel | null;
  text: string;
  voiceId: number | null;
  /** The saved reference clip, for a model that clones a voice. */
  referencePath: string | null;
  jobRunning: boolean;
}

/** What stops Generate from running, in the order the user can fix it. Null when it can run. */
export function synthesizeBlockedReason(gate: SynthesizeGate): string | null {
  if (gate.jobRunning) return "A speech job is already running.";
  const runtimeReason = runtimeBlockedReason(gate.runtime, SHERPA_NAME);
  if (runtimeReason) return runtimeReason;
  if (!gate.model) return "Choose a model first.";
  if (!gate.model.downloaded) return "Download the model first.";
  if (!gate.text.trim()) return "Write some text first.";
  if (gate.model.needsReference) {
    return gate.referencePath ? null : REFERENCE_REQUIRED_MESSAGE;
  }
  if (gate.voiceId === null) return "Choose a voice first.";
  return null;
}

/** The request for `playground_transcribe`. */
export function buildTranscribeRequest(
  jobId: string,
  model: SpeechModel,
  audio: SpeechAudioInput,
): SpeechTranscribeRequest {
  return { jobId, modelId: model.id, audioPath: audio.audioPath };
}

/** True when Generate can run: nothing blocks it. */
export function canSynthesize(gate: SynthesizeGate): boolean {
  return synthesizeBlockedReason(gate) === null;
}

/** The request for `playground_synthesize`. The text is trimmed. A cloning model sends the reference clip and voice 0. */
export function buildSynthesizeRequest(
  jobId: string,
  model: SpeechModel,
  form: SpeechForm,
  voiceId: number,
  referencePath: string | null = null,
): SpeechSynthesizeRequest {
  if (model.needsReference && referencePath) {
    return {
      jobId,
      modelId: model.id,
      text: form.text.trim(),
      voiceId: 0,
      speed: form.speed,
      referenceAudioPath: referencePath,
    };
  }
  return {
    jobId,
    modelId: model.id,
    text: form.text.trim(),
    voiceId,
    speed: form.speed,
  };
}

/** The result of a job that never started, so the panel can show why. */
export function failedSpeechResult(jobId: string, kind: SpeechKind, error: string): SpeechResult {
  return {
    jobId,
    kind,
    status: "error",
    text: null,
    outputPath: null,
    outputs: [],
    audioSeconds: null,
    elapsedSeconds: null,
    error,
  };
}

/** The store's result for a finished job, from its `playground-speech-done` event. A payload without outputs has none. */
export function speechResultOf(done: PlaygroundSpeechDone): SpeechResult {
  return {
    jobId: done.jobId,
    kind: done.kind,
    status: done.status,
    text: done.text ?? null,
    outputPath: done.outputPath ?? null,
    outputs: done.outputs ?? [],
    audioSeconds: done.audioSeconds ?? null,
    elapsedSeconds: done.elapsedSeconds ?? null,
    error: done.error ?? null,
  };
}

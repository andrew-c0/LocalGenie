import type { AudioTask, EnhanceKind, SpeechKind, SpeechModel, SpeechResult } from "../types";
import { AUDIO_TASK_OPTIONS } from "./audioText";
import type { RuntimeStatus } from "./playground";
import { audioJobBlockedReason, synthesizeBlockedReason } from "./speech";

/** The task the Audio tool opens on when no task was chosen. */
export const DEFAULT_AUDIO_TASK: AudioTask = "transcribe";

/** The Audio tool's page. The old speech and audio pages redirect here with a task in `AUDIO_TASK_PARAM`. */
const AUDIO_PATH = "/playground/audio";

/** The query parameter that names a task on entry, e.g. `?task=speak`. */
export const AUDIO_TASK_PARAM = "task";

const AUDIO_TASKS: readonly AudioTask[] = AUDIO_TASK_OPTIONS.map(([task]) => task);

/** The task a query value names, or null for a missing or unknown value. */
export function audioTaskFromParam(value: string | null): AudioTask | null {
  return AUDIO_TASKS.find((task) => task === value) ?? null;
}

/** The address of the Audio tool with its task chosen, e.g. `/playground/audio?task=enhance`. */
export function audioTaskUrl(task: AudioTask): string {
  return `${AUDIO_PATH}?${AUDIO_TASK_PARAM}=${task}`;
}

/**
 * The speech kind a task runs on: transcribe is speech to text, speak is text to speech, and enhance is the kind the
 * tool is set to (clean up or split).
 */
export function speechKindOfTask(task: AudioTask, enhanceKind: EnhanceKind): SpeechKind {
  switch (task) {
    case "transcribe":
      return "stt";
    case "speak":
      return "tts";
    case "enhance":
      return enhanceKind;
  }
}

/**
 * The file a finished job saved, for "Show in folder" and "Use as input": the speech's wav, or the first file of a
 * clean up or split (they share one folder). Null for a job that failed, was cancelled or saved nothing.
 */
export function savedPathOf(result: SpeechResult | null): string | null {
  if (result === null || result.status !== "ok") return null;
  return result.outputPath ?? result.outputs[0]?.path ?? null;
}

/** What the audio task's gate reads from the stores. */
export interface AudioTaskGate {
  runtime: RuntimeStatus;
  /** The model of the task's kind the tool has selected. */
  model: SpeechModel | null;
  /** The task's own input clip, or null when none is chosen. Speak reads it as the voice to copy, when the model needs one. */
  audioPath: string | null;
  text: string;
  voiceId: number | null;
  jobRunning: boolean;
}

/**
 * Why the task's primary action cannot run, in the order the user can fix it. Speak checks its text and voice; the
 * other tasks check the input audio. Null when the action can run.
 */
export function audioTaskBlockedReason(task: AudioTask, gate: AudioTaskGate): string | null {
  if (task === "speak") {
    return synthesizeBlockedReason({
      runtime: gate.runtime,
      model: gate.model,
      text: gate.text,
      voiceId: gate.voiceId,
      referencePath: gate.audioPath,
      jobRunning: gate.jobRunning,
    });
  }
  return audioJobBlockedReason({
    runtime: gate.runtime,
    model: gate.model,
    audioPath: gate.audioPath,
    jobRunning: gate.jobRunning,
  });
}

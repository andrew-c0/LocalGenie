import type { AudioTask, EnhanceKind } from "../types";

/** Copy for the Playground Audio tool. The copy shared with the other speech parts is in speechText.ts. */

export const AUDIO_CARD_TITLE = "Audio";

/** The task switch in the card header: each task's id and the label on its tab. */
export const AUDIO_TASK_OPTIONS: [AudioTask, string][] = [
  ["transcribe", "Speech to text"],
  ["speak", "Text to speech"],
  ["enhance", "Clean up and split"],
];

export const AUDIO_TASK_LABEL = "Audio task";

/** The label of one task, as the switch and the selector name it. */
export function audioTaskLabelOf(task: AudioTask): string {
  return AUDIO_TASK_OPTIONS.find(([id]) => id === task)?.[1] ?? task;
}

/** The enhance task's choice: each kind's chip label. */
export const ENHANCE_TASK_OPTIONS: [EnhanceKind, string][] = [
  ["denoise", "Clean up speech"],
  ["separate", "Split voice and music"],
];

export const ENHANCE_TASK_LABEL = "Clean up or split";

/** The accessible name of the info icon next to the clean up or split button. */
export const ENHANCE_OUTPUT_INFO_LABEL = "About the saved files";

export const ENHANCE_INPUT_HINT = "Choose a .wav file, or record from the microphone.";

const ENHANCE_OUTPUT_HELP: Record<EnhanceKind, string> = {
  denoise: "Cleaned speech is saved at 16 kHz mono.",
  separate: "Splitting keeps the original quality.",
};

/** What the saved files of a task are like, shown under the settings. */
export function enhanceOutputHelp(kind: EnhanceKind): string {
  return ENHANCE_OUTPUT_HELP[kind];
}

const ACTION_LABELS: Record<AudioTask, string> = {
  transcribe: "Transcribe",
  speak: "Speak",
  enhance: "Clean up",
};

const ENHANCE_ACTION_LABELS: Record<EnhanceKind, string> = {
  denoise: "Clean up",
  separate: "Split",
};

/** The primary button's label: the task's verb, and for the enhance task the kind it is set to. */
export function audioActionLabel(task: AudioTask, enhanceKind: EnhanceKind): string {
  if (task === "enhance") return ENHANCE_ACTION_LABELS[enhanceKind];
  return ACTION_LABELS[task];
}

export const NO_ENHANCE_OUTPUT_MESSAGE = "The audio was not saved.";

export const SPEAK_TEXT_LABEL = "Text";
export const SPEAK_TEXT_PLACEHOLDER = "Type what the voice should say";
export const SPEECH_NOT_SAVED_MESSAGE = "The speech was not saved.";

export const TRANSCRIBE_RESULT_TITLE = "Transcript";
export const SPEAK_RESULT_TITLE = "Speech";
export const ENHANCE_RESULT_TITLE = "Result";

export const TRANSCRIBE_FAILED_MESSAGE = "The audio could not be transcribed.";
export const SPEAK_FAILED_MESSAGE = "The speech could not be generated.";
export const ENHANCE_FAILED_MESSAGE = "The audio could not be processed.";

export const USE_AS_INPUT_LABEL = "Use as input";
export const AUDIO_TIME_INFO_LABEL = "About the time";
export const AUDIO_SAVED_PATH_LABEL = "Where the audio was saved";

export const OPENING_AUDIO_LABEL = "Opening the audio…";
export const OPENING_AUDIO_FAILED_MESSAGE = "Could not open the audio.";
export const DRAWING_WAVEFORM_LABEL = "Drawing the waveform…";
export const WAVEFORM_FAILED_MESSAGE =
  "The waveform could not be drawn. The player below still plays the file.";
export const INPUT_NOT_READ_MESSAGE = "The audio could not be read.";
export const PLAYHEAD_LABEL = "Playback position";
export const PLAY_LABEL = "Play";
export const PAUSE_LABEL = "Pause";
export const BACK_LABEL = "Back 10 seconds";
export const FORWARD_LABEL = "Forward 10 seconds";
export const DECODE_FAILED_MESSAGE = "The audio could not be decoded.";
export const PLAY_FAILED_TITLE = "Could not play the audio";
export const INPUT_LABEL_PREFIX = "Input: ";

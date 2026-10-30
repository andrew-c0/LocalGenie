import type { EnhanceKind } from "../types";

/** Copy for the Playground Audio to audio tab. The copy shared with the other speech tabs is in speechText.ts. */

/** The task switch: each task's kind, and the label on its chip. */
export const ENHANCE_TASK_OPTIONS: [EnhanceKind, string][] = [
  ["denoise", "Clean up speech"],
  ["separate", "Split voice and music"],
];

export const ENHANCE_INPUT_HINT = "Choose a .wav file, or record from the microphone.";

const ENHANCE_OUTPUT_HELP: Record<EnhanceKind, string> = {
  denoise: "Cleaned speech is saved at 16 kHz mono.",
  separate: "Splitting keeps the original quality.",
};

/** What the saved files of a task are like, shown under the Run button. */
export function enhanceOutputHelp(kind: EnhanceKind): string {
  return ENHANCE_OUTPUT_HELP[kind];
}

export const NO_ENHANCE_OUTPUT_MESSAGE = "The audio was not saved.";

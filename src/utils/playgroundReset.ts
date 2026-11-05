import type { ImageJobKind, SpeechKind } from "../types";

/** The Playground tools, by route id. Each route in `Navigation.tsx` names one of them. */
export const PLAYGROUND_TOOL_IDS = [
  "playground-text-to-image",
  "playground-image-to-image",
  "playground-image-upscaling",
  "playground-ocr",
  "playground-speech-to-text",
  "playground-text-to-speech",
  "playground-audio-to-audio",
] as const;

export type PlaygroundToolId = (typeof PLAYGROUND_TOOL_IDS)[number];

export type SpeechToolId =
  | "playground-speech-to-text"
  | "playground-text-to-speech"
  | "playground-audio-to-audio";

/** The image tools share one result slot and one job slot. Their work is told apart by these kinds. */
export type ImageWorkKind = "text" | "edit" | "upscale";

/** The work area a tool holds. Preferences (model, form, settings, modes, voice) are never part of it. */
export type WorkPart =
  | "textResult"
  | "editInput"
  | "editResult"
  | "upscaleInput"
  | "upscaleResult"
  | "ocrInput"
  | "ocrResult"
  | "speechResults"
  | "speechAudio";

/**
 * What each tool holds as work, by store slot. The speech tools share one audio input, so it is listed for all three.
 * A tool's reset clears only its own parts (see the store actions).
 */
export const WORK_BY_TOOL: Record<PlaygroundToolId, readonly WorkPart[]> = {
  "playground-text-to-image": ["textResult"],
  "playground-image-to-image": ["editInput", "editResult"],
  "playground-image-upscaling": ["upscaleInput", "upscaleResult"],
  "playground-ocr": ["ocrInput", "ocrResult"],
  "playground-speech-to-text": ["speechResults", "speechAudio"],
  "playground-text-to-speech": ["speechResults", "speechAudio"],
  "playground-audio-to-audio": ["speechResults", "speechAudio"],
};

/** The speech kinds whose last result each speech tool shows. */
export const SPEECH_KINDS_BY_TOOL: Record<SpeechToolId, readonly SpeechKind[]> = {
  "playground-speech-to-text": ["stt"],
  "playground-text-to-speech": ["tts"],
  "playground-audio-to-audio": ["denoise", "separate"],
};

/**
 * Which image tool a result or a running job belongs to. A text to image item has no input picture; an image to image
 * item has one; an upscale is its own kind. Null for anything else.
 */
export function imageWorkKind(
  item: { kind: ImageJobKind; inputPath: string | null } | null,
): ImageWorkKind | null {
  if (item === null) return null;
  if (item.kind === "upscale") return "upscale";
  return item.inputPath === null ? "text" : "edit";
}

export function isSpeechTool(tool: PlaygroundToolId): tool is SpeechToolId {
  return tool in SPEECH_KINDS_BY_TOOL;
}

/**
 * True when the speech audio stays after a tool is left. The three speech tools read the same audio, so it moves with
 * the user between them. Leaving to any other tool, or out of the Playground (`entered` null), clears it.
 */
export function keepsSpeechAudio(
  left: PlaygroundToolId,
  entered: PlaygroundToolId | null,
): boolean {
  return entered !== null && isSpeechTool(left) && isSpeechTool(entered);
}

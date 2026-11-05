import type { ImageJobKind } from "../types";

/** The Playground tools, by route id. Each route in `Navigation.tsx` names one of them. */
export const PLAYGROUND_TOOL_IDS = [
  "playground-text-to-image",
  "playground-image-to-image",
  "playground-image-upscaling",
  "playground-ocr",
  "playground-audio",
] as const;

export type PlaygroundToolId = (typeof PLAYGROUND_TOOL_IDS)[number];

/** The image tools share one result slot and one job slot. Their work is told apart by these kinds. */
export type ImageWorkKind = "text" | "edit" | "upscale";

/** The work area a tool holds. Preferences (model, form, settings, modes, voice, audio task) are never part of it. */
export type WorkPart =
  | "textResult"
  | "editInput"
  | "editResult"
  | "upscaleInput"
  | "upscaleResult"
  | "ocrInput"
  | "ocrResult"
  | "speechResults"
  | "speechInputs";

/** What each tool holds as work, by store slot. A tool's reset clears only its own parts (see the store actions). */
export const WORK_BY_TOOL: Record<PlaygroundToolId, readonly WorkPart[]> = {
  "playground-text-to-image": ["textResult"],
  "playground-image-to-image": ["editInput", "editResult"],
  "playground-image-upscaling": ["upscaleInput", "upscaleResult"],
  "playground-ocr": ["ocrInput", "ocrResult"],
  "playground-audio": ["speechResults", "speechInputs"],
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

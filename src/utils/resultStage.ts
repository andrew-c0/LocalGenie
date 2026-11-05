import type { ImageResult, InputImage } from "../types";

/**
 * The result to show for the picture on the form: the last result when it was made from that picture, else null.
 * A result for another picture stays in the store, but the stage does not show it.
 */
export function resultForInput(
  lastResult: ImageResult | null,
  input: InputImage | null,
): ImageResult | null {
  if (lastResult === null || input === null) return null;
  return lastResult.inputPath === input.path ? lastResult : null;
}

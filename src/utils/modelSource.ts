import type { ModelInfo } from "../types";

const SOURCE_LABELS: Record<ModelInfo["source"], string> = {
  hf: "Hugging Face",
  aihub: "Qualcomm AI Hub",
  docker: "Docker",
  localfs: "Local files",
};

/** The full name of a model's source for display. The stored code (`hf`, `aihub`, ...) is kept as is. */
export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source as ModelInfo["source"]] ?? source;
}

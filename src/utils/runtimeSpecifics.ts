import { SD_CPP_RUNTIME_ID } from "./playground";
import { SHERPA_RUNTIME_ID } from "./speech";

/**
 * The few things that differ by runtime. Everything else treats runtimes alike. The GenieX CLI's id is
 * named here once; its uninstall note and its usage sync (`runtimeUsage.ts`) key off it.
 */
export const GENIEX_RUNTIME_ID = "geniex";

/** What an uninstall locks or leaves behind, beyond the runtime's own files, by runtime id. */
const UNINSTALL_NOTES: Partial<Record<string, string>> = {
  [GENIEX_RUNTIME_ID]:
    "Chat, Models and Benchmarks stay locked until it is installed again. Downloaded model files are not deleted by this app.",
  [SD_CPP_RUNTIME_ID]:
    "The Playground's Text to image, Image to image and Image upscaling tabs stay locked until it is installed again. Downloaded image models are not deleted.",
  [SHERPA_RUNTIME_ID]:
    "The Playground's Audio tab stays locked until it is installed again. Downloaded speech and audio models are not deleted.",
};

/** The confirm dialog's text for uninstalling a runtime. */
export function uninstallMessage(runtimeId: string): string {
  const base = "The installed files are removed. You can install it again later.";
  const note = UNINSTALL_NOTES[runtimeId];
  return note ? `${base} ${note}` : base;
}

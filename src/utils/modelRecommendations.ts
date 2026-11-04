import type { PlaygroundDownloadView } from "../types";

/** The muted line under a model's name: its non-empty parts, joined with a dot. */
export function recommendationDetail(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

/**
 * The label of a catalog model's Download button. A running download reads Downloading, with no
 * percentage: the drawer shows the progress. A failed or cancelled download is not shown here: the button
 * reads Download again, and the drawer offers the retry.
 */
export function downloadButtonLabelOf(download: PlaygroundDownloadView | null): string {
  return download?.status === "downloading" ? "Downloading" : "Download";
}

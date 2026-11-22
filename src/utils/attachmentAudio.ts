import type { AttachmentFile } from "../types";

/**
 * A data URL for an audio attachment that already holds its bytes, or null when the file is not audio or has no data.
 * The player reads this URL, so the clip is not read from disk a second time.
 */
export function attachmentAudioUrl(file: AttachmentFile): string | null {
  if (file.kind !== "audio" || !file.data || !file.mime) return null;
  return `data:${file.mime};base64,${file.data}`;
}

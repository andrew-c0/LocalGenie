import type { AttachmentFile, AttachmentRef, Message } from "../types";

/** The image a tool row looked at (a `read_image` result), or null when the row carries none. */
export function toolRowImage(message: Message): AttachmentRef | null {
  return message.attachments?.find((file) => file.kind === "image") ?? null;
}

/** A data URL for a loaded image, or null when the file is not an image with its data. */
export function thumbnailSource(file: AttachmentFile | null | undefined): string | null {
  if (file?.kind !== "image" || !file.data || !file.mime) return null;
  return `data:${file.mime};base64,${file.data}`;
}

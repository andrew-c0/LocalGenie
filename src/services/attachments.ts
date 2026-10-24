import { invoke } from "@tauri-apps/api/core";
import type { AttachmentFile, AttachmentKind } from "../types";

/** Open a file dialog limited to one attachment kind. Resolves to the path, or null when cancelled. */
export async function pickAttachment(kind: AttachmentKind): Promise<string | null> {
  return invoke("pick_attachment", { kind });
}

/** Read a picked file for a chat message. Rejects when the file is unsupported, too large or unreadable. */
export async function readAttachment(path: string): Promise<AttachmentFile> {
  return invoke("read_attachment", { path });
}

/** Open the file's folder in Windows Explorer with the file selected. Rejects when the file is gone. */
export async function revealAttachment(path: string): Promise<void> {
  return invoke("reveal_attachment", { path });
}

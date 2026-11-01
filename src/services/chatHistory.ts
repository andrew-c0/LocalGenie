import type { AttachmentRef, Message } from "../types";
import { type PendingAttachment, userMessageContent } from "../utils/attachments";
import { messagesAfterSummary } from "../utils/compaction";
import { toast } from "../utils/toast";
import { readAttachment } from "./attachments";
import type { ChatMessage } from "./geniex";
import * as systemService from "./system";

/** Chat history for the server, and the names of stored files it had to leave out. */
export interface History {
  history: ChatMessage[];
  unavailable: string[];
}

/** Files of a stored message that were read again, and the names of those that are no longer there. */
interface StoredFiles {
  files: PendingAttachment[];
  unavailable: string[];
}

/**
 * Read a stored message's files again from their paths. A file with no stored path, or no longer on
 * the device, is left out and named in `unavailable`. A file that is there but cannot be read still
 * throws.
 */
async function readStoredFiles(refs: AttachmentRef[]): Promise<StoredFiles> {
  const files: PendingAttachment[] = [];
  const unavailable: string[] = [];
  for (const ref of refs) {
    if (!ref.path || !(await systemService.fileExists(ref.path))) {
      unavailable.push(ref.name);
      continue;
    }
    files.push({ ...(await readAttachment(ref.path)), id: ref.id });
  }
  return { files, unavailable };
}

/** Tells the user which files the model will not see because they are no longer on the device. */
export function warnUnavailable(names: string[]) {
  toast.info(
    "Files not sent",
    `No longer on this device: ${names.join(", ")}. The model will not see them. Delete the message to stop this warning.`,
  );
}

/**
 * Chat history for the server. Only the messages after the newest summary are sent; the summary
 * itself goes in the system prompt. Every user message's files are read again from their paths, so
 * the model has them on every turn. `fresh` gives the files of the message being sent, which are
 * already in memory. Files no longer on the device are left out and named in `unavailable`.
 */
export async function historyFor(
  messages: Message[],
  fresh?: { messageId: string; files: PendingAttachment[] },
): Promise<History> {
  const history: ChatMessage[] = [];
  const unavailable: string[] = [];
  for (const m of messagesAfterSummary(messages)) {
    const role = m.role as ChatMessage["role"];
    if (m.role !== "user" || !m.attachments?.length) {
      history.push({ role, content: m.content });
      continue;
    }
    if (fresh?.messageId === m.id) {
      history.push({ role, content: userMessageContent(m.content, fresh.files) });
      continue;
    }
    const stored = await readStoredFiles(m.attachments);
    unavailable.push(...stored.unavailable);
    history.push({ role, content: userMessageContent(m.content, stored.files) });
  }
  return { history, unavailable };
}

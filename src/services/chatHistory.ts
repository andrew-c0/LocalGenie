import type { AttachmentRef, Message } from "../types";
import { type PendingAttachment, userMessageContent } from "../utils/attachments";
import { messagesAfterSummary } from "../utils/compaction";
import { toast } from "../utils/toast";
import { pairedToolHistory } from "../utils/toolHistory";
import { isToolMessage } from "../utils/toolRecords";
import { readAttachment } from "./attachments";
import type { ChatMessage, ToolCallWire } from "./geniex";
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

/** The server's shape of an assistant reply's tool calls. */
function wireToolCalls(m: Message): ToolCallWire[] | undefined {
  if (!m.toolCalls?.length) return undefined;
  return m.toolCalls.map(
    (call): ToolCallWire => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: call.arguments },
    }),
  );
}

/** Text that introduces the images a group of tool results read. Sent to the server only. */
const TOOL_IMAGES_TEXT = "Image(s) from the tool call(s) above:";

/** The image references a stored message carries. */
function imageRefsOf(m: Message): AttachmentRef[] {
  return (m.attachments ?? []).filter((ref) => ref.kind === "image");
}

/**
 * Appends the images of one group of tool results as a user message, after the group's last result.
 * The server needs the results right after their calls, so the images cannot sit between them. Files
 * no longer on the device are named in `unavailable`. Nothing is added when no image can be read.
 */
async function pushToolImages(
  history: ChatMessage[],
  unavailable: string[],
  refs: AttachmentRef[],
): Promise<void> {
  const stored = await readStoredFiles(refs);
  unavailable.push(...stored.unavailable);
  if (stored.files.length === 0) return;
  history.push({ role: "user", content: userMessageContent(TOOL_IMAGES_TEXT, stored.files) });
}

/**
 * The server's message for a user, assistant or system row. A user row's files are read again from
 * their paths, unless it is the message being sent (`fresh`), whose files are already in memory.
 */
async function chatMessageFor(
  m: Message,
  unavailable: string[],
  fresh?: { messageId: string; files: PendingAttachment[] },
): Promise<ChatMessage> {
  const role = m.role as ChatMessage["role"];
  const tool_calls = wireToolCalls(m);
  if (m.role !== "user" || !m.attachments?.length) {
    return tool_calls ? { role, content: m.content, tool_calls } : { role, content: m.content };
  }
  if (fresh?.messageId === m.id) {
    return { role, content: userMessageContent(m.content, fresh.files) };
  }
  const stored = await readStoredFiles(m.attachments);
  unavailable.push(...stored.unavailable);
  return { role, content: userMessageContent(m.content, stored.files) };
}

/**
 * Chat history for the server. Only the messages after the newest summary are sent; the summary
 * itself goes in the system prompt. Every user message's files are read again from their paths, so
 * the model has them on every turn. `fresh` gives the files of the message being sent, which are
 * already in memory. Files no longer on the device are left out and named in `unavailable`.
 * Tool calls and their results are sent as pairs (see `pairedToolHistory`). The images a group of tool
 * results read follow that group as one user message; that message is not stored or shown.
 */
export async function historyFor(
  messages: Message[],
  fresh?: { messageId: string; files: PendingAttachment[] },
): Promise<History> {
  const history: ChatMessage[] = [];
  const unavailable: string[] = [];
  let toolImages: AttachmentRef[] = [];
  for (const m of pairedToolHistory(messagesAfterSummary(messages))) {
    if (isToolMessage(m)) {
      // A result without a record cannot be paired, so it is not sent (pairedToolHistory drops it).
      if (m.toolRecord) {
        history.push({
          role: "tool",
          tool_call_id: m.toolRecord.callId,
          name: m.toolRecord.name,
          content: m.content,
        });
      }
      toolImages = [...toolImages, ...imageRefsOf(m)];
      continue;
    }
    if (toolImages.length > 0) {
      await pushToolImages(history, unavailable, toolImages);
      toolImages = [];
    }
    history.push(await chatMessageFor(m, unavailable, fresh));
  }
  if (toolImages.length > 0) await pushToolImages(history, unavailable, toolImages);
  return { history, unavailable };
}

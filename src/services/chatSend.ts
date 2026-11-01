import { messagesOf, useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import type { AttachmentKind, Message } from "../types";
import type { PendingAttachment } from "../utils/attachments";
import { attachmentKindLabel, blockedKinds } from "../utils/attachments";
import { isContextOverflow } from "../utils/chatError";
import { canRemoveFrom } from "../utils/compaction";
import { compactionDue } from "../utils/compactionTrigger";
import { toast } from "../utils/toast";
import { type SummaryOutcome, summariseBeforePrompt } from "./chatCompaction";
import { modelChangeLine, saveSystemLine, sendTargetFor } from "./chatEvents";
import { type History, historyFor, warnUnavailable } from "./chatHistory";
import {
  type ModelRun,
  resolveModelRun,
  type SendFailure,
  showChatError,
  streamReply,
} from "./chatRun";
import { getCompactionSettings } from "./compaction";
import * as db from "./database";
import type { ChatMessage } from "./geniex";
import { loadModelCapabilities } from "./models";

/**
 * True when the active model may take these files. The model may have changed since the files were
 * attached, so its current scan result is checked. Otherwise a toast names what it cannot take.
 */
async function modelTakesFiles(files: { kind: AttachmentKind }[]): Promise<boolean> {
  if (files.length === 0) return true;
  const modelName = useModelStore.getState().activeModelId;
  const entries = modelName ? await loadModelCapabilities(modelName).catch(() => []) : null;
  const blocked = blockedKinds(files, entries);
  if (blocked.length === 0) return true;
  toast.error(
    "The model cannot take these files",
    `Not confirmed for ${blocked.map(attachmentKindLabel).join(", ")}. Run the settings scan or remove the files.`,
  );
  return false;
}

/**
 * The history for a prompt about to be added. Built before the input is cleared, so a missing file
 * leaves the message in the box. Null when the prompt is not to be sent (the reason is shown).
 */
export async function historyForNewPrompt(
  sessionId: string,
  prompt: Message,
  files: PendingAttachment[],
): Promise<ChatMessage[] | null> {
  // Every file in the chat goes to the model on each turn, so all of them are checked.
  const sent = [...messagesOf(sessionId), prompt];
  if (!(await modelTakesFiles(sent.flatMap((m) => m.attachments ?? [])))) return null;
  try {
    const built = await historyFor(sent, { messageId: prompt.id, files });
    if (built.unavailable.length > 0) warnUnavailable(built.unavailable);
    return built.history;
  } catch (err) {
    toast.error("Message not sent", String(err));
    return null;
  }
}

/**
 * Adds a prompt to the conversation and stores it. A change of model or compute target since the last
 * reply is shown as a line before the prompt.
 */
export async function recordPrompt(sessionId: string, prompt: Message): Promise<void> {
  const modelId = useModelStore.getState().activeModelId;
  if (modelId) {
    const line = modelChangeLine(messagesOf(sessionId), await sendTargetFor(modelId), prompt);
    if (line) saveSystemLine(sessionId, line, null);
  }
  useChatStore.getState().addMessage(sessionId, prompt);
  // The conversation is stored with its first prompt, so its row must exist before the message.
  const stored = useChatStore.getState().sessions.find((s) => s.id === sessionId);
  if (stored) await db.saveSession(stored).catch(() => {});
  await db.saveMessage(sessionId, prompt).catch(() => {});
}

/** The history sent after a summary: the prompt alone, since the summary stands for everything before it. */
async function promptOnlyHistory(
  prompt: Message,
  freshFiles?: PendingAttachment[],
): Promise<ChatMessage[]> {
  const fresh = freshFiles ? { messageId: prompt.id, files: freshFiles } : undefined;
  const built = await historyFor([prompt], fresh);
  if (built.unavailable.length > 0) warnUnavailable(built.unavailable);
  return built.history;
}

/** Tells the user a summary was tried and failed. Other outcomes are either silent or reported where they happen. */
function reportFailedSummary(outcome: SummaryOutcome): void {
  if (outcome.status === "failed") toast.error("Summary failed", outcome.reason);
}

/**
 * The summary before a prompt that reached the threshold. Resolves with the history to send, or null
 * when the user stopped the summary (the prompt is then not sent at all).
 */
async function summaryForThreshold(
  sessionId: string,
  prompt: Message,
  history: ChatMessage[],
  freshFiles: PendingAttachment[] | undefined,
  run: ModelRun,
): Promise<ChatMessage[] | null> {
  const outcome = await summariseBeforePrompt(sessionId, prompt, run);
  if (outcome.status === "cancelled") {
    toast.info(
      "Summary stopped",
      "The message was not sent. It stays in the chat without a reply.",
    );
    return null;
  }
  if (outcome.status === "done") return promptOnlyHistory(prompt, freshFiles);
  // Failed or nothing to summarise: the prompt goes with the history as it was.
  reportFailedSummary(outcome);
  return history;
}

/**
 * After the server refused the prompt as too long: summarises the history before it and sends the
 * prompt once more. Resolves with the failure to show, or null when the retry went through.
 */
async function retryAfterOverflow(
  sessionId: string,
  prompt: Message,
  freshFiles: PendingAttachment[] | undefined,
  run: ModelRun,
  failure: SendFailure,
): Promise<SendFailure | null> {
  const outcome = await summariseBeforePrompt(sessionId, prompt, run);
  if (outcome.status === "done") {
    return streamReply(sessionId, await promptOnlyHistory(prompt, freshFiles), run);
  }
  if (outcome.status === "cancelled") {
    toast.info("Summary stopped", "The message was not sent again.");
  }
  reportFailedSummary(outcome);
  return failure;
}

/**
 * Sends a prompt that is already stored in the conversation, with its history. With compaction on, the
 * conversation is summarised first when the context reaches the threshold, and once more if the server
 * refuses the prompt as too long. With compaction off, a send is exactly one request.
 */
export async function sendPrompt(
  sessionId: string,
  prompt: Message,
  history: ChatMessage[],
  freshFiles?: PendingAttachment[],
): Promise<void> {
  try {
    const run = await resolveModelRun(sessionId);
    const compaction = await getCompactionSettings();

    let toSend: ChatMessage[] | null = history;
    if (
      compactionDue({
        enabled: compaction.enabled,
        thresholdPercent: compaction.thresholdPercent,
        messages: messagesOf(sessionId),
        prompt,
        windowTokens: run.contextWindow,
      })
    ) {
      toSend = await summaryForThreshold(sessionId, prompt, history, freshFiles, run);
      if (toSend === null) return;
    }

    const failure = await streamReply(sessionId, toSend, run);
    if (!failure) return;
    if (compaction.enabled && isContextOverflow(failure.error)) {
      const remaining = await retryAfterOverflow(sessionId, prompt, freshFiles, run, failure);
      if (remaining) showChatError(sessionId, remaining);
      return;
    }
    showChatError(sessionId, failure);
  } catch (err) {
    showChatError(sessionId, { error: String(err) });
  }
}

/**
 * Sends a user message again, with the history up to it. Files are read again before anything is
 * removed, so a missing file stops the retry with the chat unchanged. Everything after the message is
 * removed, unless a summary covers it: then the retry stops with the chat unchanged.
 */
export async function retryPrompt(sessionId: string, messageId: string): Promise<void> {
  const upToRetry = messagesUpTo(sessionId, messageId);
  if (upToRetry.length === 0) return;
  if (!(await modelTakesFiles(upToRetry.flatMap((m) => m.attachments ?? [])))) return;

  let built: History;
  try {
    built = await historyFor(upToRetry);
  } catch (err) {
    toast.error("Retry cancelled", String(err));
    return;
  }
  if (built.unavailable.length > 0) warnUnavailable(built.unavailable);

  // Read again after the awaits above, so the removal and the retry use the conversation as it is now.
  const current = messagesOf(sessionId);
  const idx = current.findIndex((m) => m.id === messageId);
  if (idx < 0 || !canRemoveFrom(current, idx)) return;
  removeAfter(sessionId, messageId, current.slice(idx + 1));

  // A retry runs on the model loaded now. If that differs from the reply before the prompt, the
  // change is shown before the prompt, as for a new prompt.
  const retried = current[idx];
  const modelId = useModelStore.getState().activeModelId;
  if (modelId) {
    const line = modelChangeLine(current.slice(0, idx), await sendTargetFor(modelId), retried);
    if (line) saveSystemLine(sessionId, line, retried.id);
  }
  await sendPrompt(sessionId, retried, built.history);
}

/** The messages up to and including `messageId`. Empty when the message is not in the conversation. */
function messagesUpTo(sessionId: string, messageId: string): Message[] {
  const messages = messagesOf(sessionId);
  const idx = messages.findIndex((m) => m.id === messageId);
  return idx < 0 ? [] : messages.slice(0, idx + 1);
}

/** Removes the messages after `messageId` from the chat and from the database. */
function removeAfter(sessionId: string, messageId: string, later: Message[]): void {
  if (later.length === 0) return;
  useChatStore.getState().removeMessagesAfter(sessionId, messageId);
  for (const msg of later) {
    if (msg.isError) db.deleteChatError(msg.id).catch(() => {});
    else db.deleteMessage(msg.id).catch(() => {});
  }
}

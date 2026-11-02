import type { Message } from "../types";
import { latestSummaryIndex } from "./compaction";
import { isSystemEvent } from "./systemEvents";

/** Rough characters-per-token ratio used to estimate how much of the window the chat fills. */
const CHARS_PER_TOKEN = 4;

/**
 * Tokens that the text files of the sent messages add to the context. Estimated from the characters
 * each file sent, the same ratio as the message text. Refs saved before `chars` was kept fall back to
 * the file size in bytes, which is close for text.
 */
export function fileTokensOf(messages: Message[]): number {
  let chars = 0;
  for (const message of messages) {
    for (const file of message.attachments ?? []) {
      if (file.kind === "text") chars += file.chars ?? file.size;
    }
  }
  return Math.round(chars / CHARS_PER_TOKEN);
}

/** Estimated tokens one message adds to the context: its text and the text of its files. */
export function estimatedTokensOf(message: Message): number {
  return Math.round(message.content.length / CHARS_PER_TOKEN) + fileTokensOf([message]);
}

/** What the chat uses now: the total and the part from text files. The total is always an estimate. */
export interface ContextUsage {
  /** Tokens in the context, as sent with the next prompt. */
  total: number;
  /** The part of `total` from attached text files. Always an estimate, capped at `total`. */
  fileTokens: number;
}

/**
 * Context in use: everything the next request carries, from the newest summary on. A reply counts
 * the completion tokens the server reported for it (thinking included, since it is sent back with
 * the history); every other message is estimated from its text. The server's prompt count is not
 * used: it only covers the tokens processed for that request, and a reused KV cache leaves the
 * earlier messages out, so it is far below the real context.
 *
 * With a summary, the context is the summary plus the messages after it. Messages before it are no
 * longer sent.
 */
export function contextUsageOf(messages: Message[]): ContextUsage {
  const summaryAt = latestSummaryIndex(messages);
  const summary = summaryAt >= 0 ? messages[summaryAt] : null;
  // System lines are not sent to the model, so they add nothing to the context.
  const sent = messages.slice(summaryAt + 1).filter((m) => !isSystemEvent(m));

  let tokens = summary ? Math.round(summary.content.length / CHARS_PER_TOKEN) : 0;
  for (const message of sent) {
    tokens +=
      message.role === "assistant" && message.usage
        ? message.usage.completionTokens
        : Math.round(message.content.length / CHARS_PER_TOKEN);
  }
  const fileTokens = fileTokensOf(sent);
  const total = tokens + fileTokens;

  return { total, fileTokens: Math.min(fileTokens, total) };
}

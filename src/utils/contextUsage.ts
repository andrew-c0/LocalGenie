import type { Message } from "../types";
import { latestSummaryIndex } from "./compaction";
import { isSystemEvent } from "./systemEvents";

/** Rough characters-per-token ratio used to estimate how much of the window the chat fills. */
export const CHARS_PER_TOKEN = 4;

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

/** What the chat uses now: the total, the part from text files, and whether the total is exact. */
export interface ContextUsage {
  /** Tokens in the context. Exact when the server reported the last reply's counts. */
  total: number;
  /** The part of `total` from attached text files. Always an estimate, capped at `total`. */
  fileTokens: number;
  /** True when the total starts from the server's exact count of the last reply. */
  exact: boolean;
}

/**
 * Context in use. The last reply that reported its counts gives the exact total up to that reply.
 * Messages after it are estimated, since the server has not counted them yet. Without such a reply,
 * everything is estimated.
 *
 * With a summary, the context is the summary plus the messages after it. Counts from replies before
 * the summary describe a context that is gone, so they are ignored, and the summary text is estimated
 * until a later reply reports its counts.
 */
export function contextUsageOf(messages: Message[]): ContextUsage {
  const summaryAt = latestSummaryIndex(messages);

  // Only replies after the summary row can give an exact count (the row itself has none).
  let anchor = -1;
  for (let i = messages.length - 1; i > summaryAt; i--) {
    if (messages[i].usage) {
      anchor = i;
      break;
    }
  }

  const usage = anchor >= 0 ? messages[anchor].usage : undefined;
  const base = usage ? usage.promptTokens + usage.completionTokens : 0;
  // The summary text is in the context until a reply after it has reported its counts.
  const summaryInContext = summaryAt >= 0 && anchor < summaryAt;
  const summaryChars = summaryInContext ? (messages[summaryAt]?.content.length ?? 0) : 0;
  // System lines are not sent to the model, so they add nothing to the context.
  const since = messages
    .slice(summaryInContext ? summaryAt + 1 : anchor + 1)
    .filter((m) => !isSystemEvent(m));
  const sinceChars = summaryChars + since.reduce((sum, m) => sum + m.content.length, 0);
  const total = base + Math.round(sinceChars / CHARS_PER_TOKEN) + fileTokensOf(since);

  // Files sent before the summary are no longer in the context.
  const inContext = summaryAt >= 0 ? messages.slice(summaryAt + 1) : messages;

  return {
    total,
    fileTokens: Math.min(fileTokensOf(inContext), total),
    exact: usage !== undefined,
  };
}

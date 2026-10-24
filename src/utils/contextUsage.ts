import type { Message } from "../types";

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
 */
export function contextUsageOf(messages: Message[]): ContextUsage {
  let anchor = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].usage) {
      anchor = i;
      break;
    }
  }

  const usage = anchor >= 0 ? messages[anchor].usage : undefined;
  const base = usage ? usage.promptTokens + usage.completionTokens : 0;
  const since = messages.slice(anchor + 1);
  const sinceChars = since.reduce((sum, m) => sum + m.content.length, 0);
  const total = base + Math.round(sinceChars / CHARS_PER_TOKEN) + fileTokensOf(since);

  return {
    total,
    fileTokens: Math.min(fileTokensOf(messages), total),
    exact: usage !== undefined,
  };
}

import type { Message } from "../types";
import { messagesBefore, shouldCompact } from "./compaction";
import { contextUsageOf, estimatedTokensOf } from "./contextUsage";

export interface CompactionTriggerInput {
  /** The compaction setting. Off means no summary is ever started by a send. */
  enabled: boolean;
  thresholdPercent: number;
  /** The conversation, with the new prompt already in it. */
  messages: Message[];
  /** The prompt about to be sent. It is the last message the usage is counted up to. */
  prompt: Message;
  /** The window the chat shows for the model, or null when it is not known. */
  windowTokens: number | null;
}

/**
 * True when a send should summarise the conversation before its prompt. The context so far (the
 * messages before the prompt) plus the prompt must reach the threshold share of the window.
 */
export function compactionDue({
  enabled,
  thresholdPercent,
  messages,
  prompt,
  windowTokens,
}: CompactionTriggerInput): boolean {
  if (!enabled || windowTokens === null) return false;
  return shouldCompact({
    usedTokens: contextUsageOf(messagesBefore(messages, prompt.id)).total,
    newPromptTokens: estimatedTokensOf(prompt),
    windowTokens,
    thresholdPercent,
  });
}

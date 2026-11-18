import type { Message } from "../types";
import { isSystemEvent } from "./systemEvents";
import { parseThinking } from "./thinking";
import { isReplyMessage } from "./toolRecords";

/** What Continue does with a stopped or interrupted conversation: run its turn, or only end it. */
export type ContinueAction = "finished" | "run";

/** The report a conversation keeps from its final reply: the reply's text, cut to this many characters. */
export const FINISHED_REPORT_MAX_CHARS = 200;

/**
 * "finished" when the last stored message (system lines aside) is a final answer: an assistant reply with text
 * and no tool call. The model has already answered, so Continue only ends the conversation and sends nothing. Any
 * other last message runs the turn from the stored messages: a user message, a tool result, a reply whose calls
 * still wait for results, an error line, or a reply with no text.
 */
export function continueAction(messages: readonly Message[]): ContinueAction {
  return finalAnswerOf(messages) === "" ? "run" : "finished";
}

/** The text of the final answer `continueAction` finds, trimmed. Empty when the conversation is not finished. */
export function finalAnswerOf(messages: readonly Message[]): string {
  const last = lastSpokenMessage(messages);
  if (!last || !isReplyMessage(last)) return "";
  if ((last.toolCalls?.length ?? 0) > 0) return "";
  return parseThinking(last.content).answer.trim();
}

/** The newest message that is not a system line, or undefined. */
function lastSpokenMessage(messages: readonly Message[]): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!isSystemEvent(messages[i])) return messages[i];
  }
  return undefined;
}

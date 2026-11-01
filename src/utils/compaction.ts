import type { CompactMessage, Message } from "../types";
import { isSystemEvent } from "./systemEvents";
import { parseThinking } from "./thinking";

/** The `systemType` of the summary row that stands for the messages before it. */
export const SUMMARY_SYSTEM_TYPE = "summary";

/** Heading of the summary block added to the system prompt. */
const SUMMARY_HEADING = "Summary of the conversation so far (automatic):";

/** True for a summary row: a system line whose type is `summary`. */
export function isSummaryMessage(m: Pick<Message, "kind" | "systemType">): boolean {
  return m.kind === "system" && m.systemType === SUMMARY_SYSTEM_TYPE;
}

/** Position of the newest summary row in `messages`, or -1 when there is none. */
export function latestSummaryIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isSummaryMessage(messages[i])) return i;
  }
  return -1;
}

/** The newest summary row, or null when the conversation has none. */
export function latestSummary(messages: Message[]): Message | null {
  const index = latestSummaryIndex(messages);
  return index >= 0 ? messages[index] : null;
}

/**
 * The messages after the newest summary row, in order, without system lines. All messages (without
 * system lines) when there is no summary.
 */
export function messagesAfterSummary(messages: Message[]): Message[] {
  const start = latestSummaryIndex(messages) + 1;
  return messages.slice(start).filter((m) => !isSystemEvent(m));
}

/** The messages before the one with `id`. All of them when that message is not in the list. */
export function messagesBefore(messages: Message[], id: string): Message[] {
  const at = messages.findIndex((m) => m.id === id);
  return at < 0 ? messages : messages.slice(0, at);
}

/** Position of the last message that any summary row covers, or -1 when none covers one. */
function coveredThroughIndex(messages: Message[]): number {
  let covered = -1;
  for (const summary of messages) {
    if (!isSummaryMessage(summary) || !summary.coversThroughId) continue;
    const at = messages.findIndex((m) => m.id === summary.coversThroughId);
    if (at > covered) covered = at;
  }
  return covered;
}

/**
 * Ids of the messages a summary stands in for: every message at or before the last message a summary
 * covers, and every summary row. These cannot be deleted or retried.
 */
export function coveredMessageIds(messages: Message[]): Set<string> {
  const through = coveredThroughIndex(messages);
  const ids = new Set<string>();
  messages.forEach((m, index) => {
    if (index <= through || isSummaryMessage(m)) ids.add(m.id);
  });
  return ids;
}

/**
 * True when a summary stands in for the message: it sits at or before the last message a summary
 * covers, or it is a summary row itself. Such a message cannot be deleted or retried.
 */
export function isCoveredBySummary(messages: Message[], id: string): boolean {
  return coveredMessageIds(messages).has(id);
}

/**
 * True when the messages from `index` on can be removed. None of them may be covered by a summary or
 * be a summary row. The store and the delete path both check this, so no button can bypass it.
 */
export function canRemoveFrom(messages: Message[], index: number): boolean {
  return (
    index >= 0 && index > coveredThroughIndex(messages) && latestSummaryIndex(messages) < index
  );
}

/** What a summary call is given: the previous summary, the messages to fold in, and where they end. */
export interface SummaryInput {
  previousSummary: string | null;
  items: CompactMessage[];
  /** The last message before the new prompt, or null when there is none. */
  coversThroughId: string | null;
}

/**
 * The text a message contributes to a summary. A reply loses its thinking; a user message keeps its
 * text and gets a short line naming its attachments. Empty when there is nothing left to send.
 */
function summaryItemOf(m: Message): CompactMessage | null {
  // An error shown in the chat is not part of the conversation, so it stays out of the summary.
  if (m.isError || (m.role !== "user" && m.role !== "assistant")) return null;
  const text = m.role === "assistant" ? parseThinking(m.content).answer : m.content.trim();
  const names = (m.attachments ?? []).map((file) => file.name);
  const attached = names.length > 0 ? `User attached: ${names.join(", ")}` : "";
  const content = [text, attached].filter(Boolean).join("\n").trim();
  return content ? { role: m.role, content } : null;
}

/**
 * What to summarise for a new prompt: the messages before that prompt, from the newest summary on.
 * The previous summary goes in as well, so a later summary folds it in and summaries do not chain.
 * A prompt that is not in `messages` counts as not yet added, so every message is before it.
 */
export function summaryInputFor(messages: Message[], newPromptId: string): SummaryInput {
  const before = messagesBefore(messages, newPromptId);
  const summary = latestSummary(before);
  const items = messagesAfterSummary(before)
    .map(summaryItemOf)
    .filter((item): item is CompactMessage => item !== null);
  return {
    previousSummary: summary ? summary.content : null,
    items,
    coversThroughId: before.length > 0 ? before[before.length - 1].id : null,
  };
}

export interface CompactionCheck {
  /** Tokens the context uses now (see `contextUsageOf`). */
  usedTokens: number;
  /** Estimated tokens of the prompt about to be sent. */
  newPromptTokens: number;
  windowTokens: number;
  /** Share of the window, in percent, that triggers a summary. */
  thresholdPercent: number;
}

/** True when the prompt would take the context to the threshold share of the window, or past it. */
export function shouldCompact({
  usedTokens,
  newPromptTokens,
  windowTokens,
  thresholdPercent,
}: CompactionCheck): boolean {
  if (windowTokens <= 0) return false;
  // Multiplied out, so the comparison stays in whole numbers.
  return (usedTokens + newPromptTokens) * 100 >= windowTokens * thresholdPercent;
}

/**
 * The system prompt with the summary appended as its own block. The block alone when the prompt is
 * empty, and the prompt unchanged when there is no summary.
 */
export function systemPromptWithSummary(systemPrompt: string, summary: string | null): string {
  const text = summary?.trim();
  if (!text) return systemPrompt;
  const block = `${SUMMARY_HEADING}\n${text}`;
  return systemPrompt.trim() === "" ? block : `${systemPrompt}\n\n${block}`;
}

export interface SummaryRowInput {
  /**
   * The session the row belongs to. A `Message` does not carry it, so the caller saves the row with
   * `saveMessage(sessionId, row)`; it is not used here.
   */
  sessionId: string;
  summary: string;
  coversThroughId: string | null;
  /** The prompt that triggered the summary. The row goes just before it. */
  beforeMessage: Pick<Message, "timestamp">;
}

/**
 * The summary row for a conversation. It is a system line, so the transcript stays user and assistant
 * only. Its time is one millisecond before the prompt, so deleting or retrying that prompt keeps it.
 */
export function summaryRowFor({
  summary,
  coversThroughId,
  beforeMessage,
}: SummaryRowInput): Message {
  return {
    id: crypto.randomUUID(),
    role: "system",
    kind: "system",
    systemType: SUMMARY_SYSTEM_TYPE,
    content: summary,
    timestamp: beforeMessage.timestamp - 1,
    coversThroughId,
  };
}

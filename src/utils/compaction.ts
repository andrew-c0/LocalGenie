import type { CompactMessage, Message } from "../types";
import { isSystemEvent } from "./systemEvents";
import { parseThinking } from "./thinking";
import { isToolMessage, toolCallText, toolResultText } from "./toolRecords";

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
 * be a summary row, and the range cannot start at a tool row: that would split a call from its result.
 * Removing from an assistant reply takes its tool rows, which come after it. The store and the delete
 * path both check this, so no button can bypass it.
 */
export function canRemoveFrom(messages: Message[], index: number): boolean {
  const first = messages[index];
  return (
    first !== undefined &&
    !isToolMessage(first) &&
    index > coveredThroughIndex(messages) &&
    latestSummaryIndex(messages) < index
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
 * The text a user or assistant message contributes to a summary. A reply loses its thinking and keeps
 * the calls it made as text; a user message keeps its text and gets a short line naming its
 * attachments. Null when there is nothing left to send.
 */
function summaryItemOf(m: Message): CompactMessage | null {
  if (m.role !== "user" && m.role !== "assistant") return null;
  const text = m.role === "assistant" ? parseThinking(m.content).answer : m.content.trim();
  const calls = (m.toolCalls ?? []).map(toolCallText);
  const names = (m.attachments ?? []).map((file) => file.name);
  const attached = names.length > 0 ? `User attached: ${names.join(", ")}` : "";
  const content = [text, ...calls, attached].filter(Boolean).join("\n").trim();
  return content ? { role: m.role, content } : null;
}

/**
 * The summary transcript of a run of messages, as plain text. Errors stay out. A tool result is text
 * in the transcript, never a `tool` role: it joins the reply that made the call, or starts an
 * assistant item when no reply precedes it.
 */
export function summaryItemsOf(messages: Message[]): CompactMessage[] {
  const items: CompactMessage[] = [];
  for (const m of messages) {
    // An error shown in the chat is not part of the conversation, so it stays out of the summary.
    if (m.isError) continue;
    if (!isToolMessage(m)) {
      const item = summaryItemOf(m);
      if (item) items.push(item);
      continue;
    }
    const text = toolResultText(m.toolRecord, m.content);
    const last = items[items.length - 1];
    if (last?.role === "assistant") {
      items[items.length - 1] = { role: "assistant", content: `${last.content}\n${text}` };
    } else {
      items.push({ role: "assistant", content: text });
    }
  }
  return items;
}

/**
 * The id of the newest message a summary can cover: one that is neither a system line nor an error.
 * An error is not part of the conversation, so it never becomes the end of a summary. Null when none.
 */
export function lastSummarisableId(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!isSystemEvent(m) && !m.isError) return m.id;
  }
  return null;
}

/**
 * What to summarise for a conversation as it stands: the messages from the newest summary on, folded
 * into that summary. The previous summary goes in as well, so a later summary folds it in and summaries
 * do not chain.
 */
export function summaryInputBefore(messages: Message[]): SummaryInput {
  const summary = latestSummary(messages);
  return {
    previousSummary: summary ? summary.content : null,
    items: summaryItemsOf(messagesAfterSummary(messages)),
    coversThroughId: lastSummarisableId(messages),
  };
}

/**
 * What to summarise for a new prompt: the messages before that prompt. A prompt that is not in
 * `messages` counts as not yet added, so every message is before it.
 */
export function summaryInputFor(messages: Message[], newPromptId: string): SummaryInput {
  return summaryInputBefore(messagesBefore(messages, newPromptId));
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

/**
 * Where a summary row goes. Before the prompt that triggered it, or at the end of the conversation when
 * the user asked for it (Compact now).
 */
export type SummaryPlacement =
  | { kind: "beforePrompt"; prompt: Pick<Message, "id" | "timestamp"> }
  | { kind: "atEnd"; lastTimestamp: number; now: number };

export interface SummaryRowInput {
  /**
   * The session the row belongs to. A `Message` does not carry it, so the caller saves the row with
   * `saveMessage(sessionId, row)`; it is not used here.
   */
  sessionId: string;
  summary: string;
  coversThroughId: string | null;
  placement: SummaryPlacement;
}

/** The id of the message a summary row goes before, or null when it goes at the end. */
export function summaryBeforeId(placement: SummaryPlacement): string | null {
  return placement.kind === "beforePrompt" ? placement.prompt.id : null;
}

/**
 * The time of a summary row. Before a prompt it is one millisecond earlier, so deleting or retrying that
 * prompt keeps the row. At the end it is after the newest message and not before now, so it sorts last.
 */
function summaryTimeOf(placement: SummaryPlacement): number {
  if (placement.kind === "beforePrompt") return placement.prompt.timestamp - 1;
  return Math.max(placement.now, placement.lastTimestamp + 1);
}

/**
 * The summary row for a conversation. It is a system line, so the transcript stays user and assistant
 * only. The row is stored by the caller at `summaryBeforeId(placement)`, or at the end.
 */
export function summaryRowFor({ summary, coversThroughId, placement }: SummaryRowInput): Message {
  return {
    id: crypto.randomUUID(),
    role: "system",
    kind: "system",
    systemType: SUMMARY_SYSTEM_TYPE,
    content: summary,
    timestamp: summaryTimeOf(placement),
    coversThroughId,
  };
}

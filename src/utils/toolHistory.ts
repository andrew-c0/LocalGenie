import type { ChatToolCall, Message } from "../types";
import { isToolMessage } from "./toolRecords";

/**
 * The messages to send to the server, with each tool call paired with its result. The server needs
 * every call answered by a `tool` message right after the assistant message that made it, so:
 * - a call is sent only when a tool row in the run right after its assistant message answers it; a
 *   call without one is dropped from the request, and an assistant message with no call left is sent
 *   as plain text;
 * - a tool row is sent only when the call it answers is sent. Any other tool row (an orphan) is dropped.
 * Messages keep their order. An assistant message whose calls changed is returned as a copy.
 */
export function pairedToolHistory(messages: Message[]): Message[] {
  const sent: Message[] = [];
  let index = 0;
  while (index < messages.length) {
    const message = messages[index];
    index++;
    if (isToolMessage(message)) continue;
    if (!message.toolCalls || message.toolCalls.length === 0) {
      sent.push(message);
      continue;
    }

    const runEnd = endOfToolRun(messages, index);
    const run = messages.slice(index, runEnd);
    const { calls, results } = pairRun(message.toolCalls, run);
    sent.push({ ...message, toolCalls: calls.length > 0 ? calls : undefined }, ...results);
    index = runEnd;
  }
  return sent;
}

/** Index just past the run of tool rows that starts at `from`. */
function endOfToolRun(messages: Message[], from: number): number {
  let end = from;
  while (end < messages.length && isToolMessage(messages[end])) end++;
  return end;
}

/**
 * The calls that have a result in `run`, and those results in the order they appear. A result answers
 * a call when its record names the call's id. A result answers at most one call, so each call claims
 * its own row.
 */
function pairRun(
  calls: ChatToolCall[],
  run: Message[],
): { calls: ChatToolCall[]; results: Message[] } {
  const claimed = new Set<number>();
  const answeredCalls: ChatToolCall[] = [];
  for (const call of calls) {
    const at = run.findIndex((row, i) => !claimed.has(i) && row.toolRecord?.callId === call.id);
    if (at < 0) continue;
    claimed.add(at);
    answeredCalls.push(call);
  }
  return {
    calls: answeredCalls,
    results: run.filter((_, i) => claimed.has(i)),
  };
}

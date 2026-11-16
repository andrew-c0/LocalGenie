import type { Message } from "../types";
import { parseThinking } from "./thinking";

/** The line shown while a summary is written, before or after a send. */
export const COMPACTING_LABEL = "Summarising the conversation…";

/**
 * What the model is doing before its visible answer starts. Derived from the streamed text:
 * no reply yet → prefill; an open thinking block → its own panel shows progress (null here);
 * no answer text yet → outputting. Returns null once visible answer text exists.
 */
export function streamingStatusLabel(
  messages: readonly Message[],
  isStreaming: boolean,
  compacting: boolean,
): string | null {
  // A summary runs before the send, so it is shown in place of the streaming status.
  if (compacting) return COMPACTING_LABEL;
  if (!isStreaming) return null;
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant") return "Prefilling prompt…";
  const reply = parseThinking(last.content);
  if (reply.thinkingOpen) return null;
  return reply.answer ? null : "Outputting…";
}

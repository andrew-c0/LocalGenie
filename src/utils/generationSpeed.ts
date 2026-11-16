import type { ChatSession } from "../types";
import { chatSessionsOf } from "./conversations";

/** One model's measured throughput on one reply. */
export interface SpeedEntry {
  /** The model's short name: the part after the last slash. */
  model: string;
  /** Tokens per second of that reply. */
  tps: number;
}

/**
 * The fastest replies among the chat conversations, fastest first. Dispatch conversations are left out: they
 * are background work, not a chat statistic. A reply counts when it has a time, a token count and a model.
 */
export function fastestReplies(sessions: readonly ChatSession[], limit: number): SpeedEntry[] {
  const entries: SpeedEntry[] = [];
  for (const session of chatSessionsOf(sessions)) {
    for (const message of session.messages) {
      if (
        message.role === "assistant" &&
        message.stats &&
        message.stats.totalTime > 0 &&
        message.stats.tokenCount > 0 &&
        message.modelId
      ) {
        const tps = message.stats.tokenCount / (message.stats.totalTime / 1000);
        entries.push({ model: message.modelId.split("/").pop() ?? message.modelId, tps });
      }
    }
  }
  return entries.sort((a, b) => b.tps - a.tps).slice(0, limit);
}

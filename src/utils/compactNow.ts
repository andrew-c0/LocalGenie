import type { Message } from "../types";
import { summaryInputBefore } from "./compaction";

/** What decides whether a conversation can be summarised now, without a prompt. */
export interface CompactNowState {
  /** The model the chat runs on, or null when none is selected. */
  modelId: string | null;
  serverRunning: boolean;
  streaming: boolean;
  compacting: boolean;
  messages: Message[];
}

/**
 * Why Compact now cannot run, as the text its disabled button shows. Null when it can run. The first
 * reason that applies is the one shown.
 */
export function compactNowBlocker(state: CompactNowState): string | null {
  if (state.compacting) return "A summary is already running.";
  if (state.streaming) return "Wait for the reply to finish.";
  if (state.modelId === null) return "Select a model to summarise this conversation.";
  if (!state.serverRunning) return "Start the GenieX server to summarise this conversation.";
  if (summaryInputBefore(state.messages).items.length === 0) {
    return "Nothing to summarise yet: no messages since the last summary.";
  }
  return null;
}

import { messagesOf, useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import type { Message } from "../types";
import { summaryInputFor, summaryRowFor } from "../utils/compaction";
import { parseThinking } from "../utils/thinking";
import { saveSystemLine } from "./chatEvents";
import type { ModelRun } from "./chatRun";
import { cancelCompaction, compactConversation } from "./compaction";
import { serverBaseUrl } from "./geniex";

/** How a summary before a prompt ended. */
export type SummaryOutcome =
  /** The summary row is stored just before the prompt. */
  | { status: "done" }
  /** Nothing new to summarise, so there is nothing to do. */
  | { status: "skipped" }
  /** The user stopped it. The chat is unchanged. */
  | { status: "cancelled" }
  /** The call failed, or returned no text. */
  | { status: "failed"; reason: string };

const CANCELLED: SummaryOutcome = { status: "cancelled" };

/** Jobs the user stopped. A stopped job may still reject or resolve, so its outcome is read from here. */
const stoppedJobs = new Set<string>();

/**
 * Stores the summary as a row just before the prompt. A reply with no text is a failure: there is
 * nothing to send in its place.
 */
function storeSummary(
  sessionId: string,
  prompt: Message,
  coversThroughId: string | null,
  reply: string,
): SummaryOutcome {
  // A summary with a thinking block keeps only its answer.
  const summary = parseThinking(reply).answer;
  if (!summary) return { status: "failed", reason: "The model returned an empty summary." };
  const row = summaryRowFor({ sessionId, summary, coversThroughId, beforeMessage: prompt });
  saveSystemLine(sessionId, row, prompt.id);
  return { status: "done" };
}

/**
 * Summarises the conversation before `prompt` (the prompt is already stored) and saves the summary as
 * a row just before it. Only the messages before the prompt are summarised, folded into any earlier
 * summary. The chat shows the summary as running while the call is in flight.
 */
export async function summariseBeforePrompt(
  sessionId: string,
  prompt: Message,
  run: ModelRun,
): Promise<SummaryOutcome> {
  if (!run.modelId) return { status: "skipped" };
  const input = summaryInputFor(messagesOf(sessionId), prompt.id);
  if (input.items.length === 0) return { status: "skipped" };

  const jobId = crypto.randomUUID();
  const chat = useChatStore.getState();
  chat.setCompacting(jobId);
  try {
    const result = await compactConversation({
      jobId,
      baseUrl: serverBaseUrl(useModelStore.getState().serverPort),
      model: run.modelId,
      load: run.load,
      previousSummary: input.previousSummary ?? undefined,
      messages: input.items,
      windowTokens: run.contextWindow ?? undefined,
    });
    return stoppedJobs.has(jobId)
      ? CANCELLED
      : storeSummary(sessionId, prompt, input.coversThroughId, result.summary);
  } catch (err) {
    return stoppedJobs.has(jobId) ? CANCELLED : { status: "failed", reason: String(err) };
  } finally {
    stoppedJobs.delete(jobId);
    chat.setCompacting(null);
  }
}

/** Stops the running summary, if one runs. The conversation keeps its history unchanged. */
export async function stopSummary(): Promise<void> {
  const jobId = useChatStore.getState().compactionJobId;
  if (!jobId) return;
  stoppedJobs.add(jobId);
  await cancelCompaction(jobId);
}

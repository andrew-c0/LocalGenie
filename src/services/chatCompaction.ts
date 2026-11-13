import { messagesOf, useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import type { Message } from "../types";
import {
  type SummaryInput,
  type SummaryPlacement,
  summaryBeforeId,
  summaryInputBefore,
  summaryInputFor,
  summaryRowFor,
} from "../utils/compaction";
import { parseThinking } from "../utils/thinking";
import { toast } from "../utils/toast";
import { saveSystemLine } from "./chatEvents";
import { type ModelRun, resolveModelRun } from "./chatRun";
import { cancelCompaction, compactConversation } from "./compaction";
import { serverBaseUrl } from "./geniex";

/** How a summary ended. */
export type SummaryOutcome =
  /** The summary row is stored at its place. */
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
 * Stores the summary as a row at `placement`. A reply with no text is a failure: there is nothing to
 * send in its place.
 */
function storeSummary(
  sessionId: string,
  reply: string,
  coversThroughId: string | null,
  placement: SummaryPlacement,
): SummaryOutcome {
  // A summary with a thinking block keeps only its answer.
  const summary = parseThinking(reply).answer;
  if (!summary) return { status: "failed", reason: "The model returned an empty summary." };
  const row = summaryRowFor({ sessionId, summary, coversThroughId, placement });
  saveSystemLine(sessionId, row, summaryBeforeId(placement));
  return { status: "done" };
}

/**
 * Asks the model to summarise `input` and stores the result at `placement`. The chat shows the summary as
 * running while the call is in flight, and the Stop button cancels it. Nothing is stored unless the call
 * returns text.
 */
async function summariseInto(
  sessionId: string,
  input: SummaryInput,
  run: ModelRun & { modelId: string },
  placement: SummaryPlacement,
): Promise<SummaryOutcome> {
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
      : storeSummary(sessionId, result.summary, input.coversThroughId, placement);
  } catch (err) {
    return stoppedJobs.has(jobId) ? CANCELLED : { status: "failed", reason: String(err) };
  } finally {
    stoppedJobs.delete(jobId);
    chat.setCompacting(null);
  }
}

/** Summarises `input` when there is a model and something to summarise; otherwise it is skipped. */
async function summariseIfNeeded(
  sessionId: string,
  input: SummaryInput,
  run: ModelRun,
  placement: SummaryPlacement,
): Promise<SummaryOutcome> {
  const { modelId } = run;
  if (modelId === null || input.items.length === 0) return { status: "skipped" };
  return summariseInto(sessionId, input, { ...run, modelId }, placement);
}

/**
 * Summarises the conversation before `prompt` (the prompt is already stored) and saves the summary as
 * a row just before it. Only the messages before the prompt are summarised, folded into any earlier
 * summary.
 */
export function summariseBeforePrompt(
  sessionId: string,
  prompt: Message,
  run: ModelRun,
): Promise<SummaryOutcome> {
  const input = summaryInputFor(messagesOf(sessionId), prompt.id);
  return summariseIfNeeded(sessionId, input, run, { kind: "beforePrompt", prompt });
}

/**
 * Summarises the whole conversation now, without a prompt, and appends the summary at the end. Nothing
 * is sent to the chat, and the conversation stays as it is when the summary fails or is stopped. Its
 * caller checks that the chat can run it (see `compactNowBlocker`).
 */
export async function compactConversationNow(sessionId: string): Promise<void> {
  try {
    const run = await resolveModelRun(sessionId);
    // Read after the await: the conversation is what it is when the summary starts.
    const chat = useChatStore.getState();
    if (chat.isStreaming || chat.compacting) return;
    const messages = messagesOf(sessionId);
    const last = messages[messages.length - 1];
    const placement: SummaryPlacement = {
      kind: "atEnd",
      lastTimestamp: last?.timestamp ?? 0,
      now: Date.now(),
    };
    const outcome = await summariseIfNeeded(
      sessionId,
      summaryInputBefore(messages),
      run,
      placement,
    );
    if (outcome.status === "failed") toast.error("Summary failed", outcome.reason);
  } catch (err) {
    toast.error("Summary failed", String(err));
  }
}

/** Stops the running summary, if one runs. The conversation keeps its history unchanged. */
export async function stopSummary(): Promise<void> {
  const jobId = useChatStore.getState().compactionJobId;
  if (!jobId) return;
  stoppedJobs.add(jobId);
  await cancelCompaction(jobId);
}

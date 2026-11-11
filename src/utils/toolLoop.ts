import type {
  AttachmentRef,
  CapabilityEntry,
  ChatToolCall,
  Message,
  SearchSourceInfo,
  ToolApproval,
  ToolDefinition,
  ToolRecord,
  ToolResult,
  ToolResultAttachment,
  ToolSpec,
  ToolStatus,
} from "../types";
import { offeredToolNames, type ToolState } from "./toolAccess";
import { toToolDefinitions } from "./toolDefinitions";
import { isReplyMessage, isToolMessage } from "./toolRecords";
import { withEnabledSources } from "./webSearchSources";

/** Requests of one send that run tools. After this many rounds the next request offers no tools. */
export const MAX_ROUNDS = 5;

/** Calls of one reply that run. Any further calls in the same reply are skipped. */
export const MAX_CALLS_PER_ROUND = 4;

/** Texts the model reads as the result of a call that did not run. */
export const TOOL_TEXT = {
  denied: "The user denied this call.",
  cancelled: "The user stopped this call.",
  off: "This tool is turned off.",
  noSource: "No search source is turned on, so this tool is not available.",
  skipped: `Skipped: too many tool calls in one step (the limit is ${MAX_CALLS_PER_ROUND}).`,
  noVision:
    "This model cannot view images (vision is not confirmed for it in the settings scan). Describe the image another way or ask the user to switch model.",
} as const;

/** The tools that read files in the allowed folders. Their descriptions name the folders. */
const FILE_TOOL_NAMES = new Set(["list_directory", "read_text_file", "read_image"]);

/** True when a request that follows `roundsRun` rounds may still offer tools. */
export function toolsAllowedAfter(roundsRun: number): boolean {
  return roundsRun < MAX_ROUNDS;
}

/** Index of the last message that is an assistant reply, or -1 when there is none. */
function lastReplyIndex(messages: Message[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (isReplyMessage(messages[index])) return index;
  }
  return -1;
}

/**
 * The calls of the last reply that have no result yet. Empty when the last reply made no calls, when
 * every call has a tool row after it, or when a user message came after the reply (the calls then belong
 * to an older turn and are not run again).
 */
export function pendingToolCalls(messages: Message[]): ChatToolCall[] {
  const replyIndex = lastReplyIndex(messages);
  if (replyIndex < 0) return [];
  const reply = messages[replyIndex];
  if (!reply.toolCalls?.length) return [];

  const after = messages.slice(replyIndex + 1);
  if (after.some((message) => message.role === "user")) return [];
  const answered = new Set(
    after
      .filter(isToolMessage)
      .map((message) => message.toolRecord?.callId)
      .filter((callId): callId is string => callId !== undefined),
  );
  return reply.toolCalls.filter((call) => !answered.has(call.id));
}

/** The calls a round runs, and the calls over the per-round limit that are skipped. Order is kept. */
export function splitCalls(calls: ChatToolCall[]): {
  run: ChatToolCall[];
  skipped: ChatToolCall[];
} {
  return {
    run: calls.slice(0, MAX_CALLS_PER_ROUND),
    skipped: calls.slice(MAX_CALLS_PER_ROUND),
  };
}

/** What became of one call: the status, the text the model reads, and how it was approved. */
export interface ToolOutcome {
  status: ToolStatus;
  content: string;
  approval: ToolApproval;
  durationMs?: number;
  truncated?: boolean;
  /** Files the result carries for the model to see, such as an image. */
  attachments?: AttachmentRef[];
}

/** The outcome of a call that ran: its result, with the status the tool reported. */
export function resultOutcome(result: ToolResult, approval: ToolApproval): ToolOutcome {
  return {
    status: result.ok ? "ok" : "error",
    content: result.content,
    approval,
    durationMs: result.durationMs,
    truncated: result.truncated,
  };
}

/** The outcome of a call that threw before it could report a result. */
export function failedOutcome(message: string, approval: ToolApproval): ToolOutcome {
  return { status: "error", content: message, approval };
}

/**
 * The outcome of an image result the model may not receive. It counts as a failed call, so the image is
 * not kept and the model is told why.
 */
export function noVisionOutcome(result: ToolResult, approval: ToolApproval): ToolOutcome {
  return resultOutcome({ ...result, ok: false, content: TOOL_TEXT.noVision }, approval);
}

/** The stored form of an image a tool read: a file reference with its path. The backend gives no size, so it is 0. */
export function toolImageRef(attachment: ToolResultAttachment, id: string): AttachmentRef {
  return { id, kind: "image", name: attachment.name, size: 0, path: attachment.path };
}

export function deniedOutcome(): ToolOutcome {
  return { status: "denied", content: TOOL_TEXT.denied, approval: "once" };
}

export function cancelledOutcome(): ToolOutcome {
  return { status: "cancelled", content: TOOL_TEXT.cancelled, approval: "once" };
}

export function offOutcome(): ToolOutcome {
  return { status: "denied", content: TOOL_TEXT.off, approval: "once" };
}

/** A search call while no source is turned on. The tool is not offered then, so the call does not run. */
export function noSourceOutcome(): ToolOutcome {
  return { status: "denied", content: TOOL_TEXT.noSource, approval: "once" };
}

export function skippedOutcome(): ToolOutcome {
  return { status: "denied", content: TOOL_TEXT.skipped, approval: "once" };
}

/** A call to a name the registry does not know. No approval step applies, so the approval is `auto`. */
export function unknownToolOutcome(name: string): ToolOutcome {
  return { status: "error", content: `Unknown tool: ${name}`, approval: "auto" };
}

/** The record a `tool` row keeps for one call and its outcome. */
export function buildToolRecord(call: ChatToolCall, outcome: ToolOutcome): ToolRecord {
  const record: ToolRecord = {
    callId: call.id,
    name: call.name,
    arguments: call.arguments,
    status: outcome.status,
    approval: outcome.approval,
  };
  if (outcome.durationMs !== undefined) record.durationMs = outcome.durationMs;
  if (outcome.truncated !== undefined) record.truncated = outcome.truncated;
  return record;
}

/** The `tool` row that answers one call. Its content is the text the model reads as the result. */
export function buildToolMessage(
  call: ChatToolCall,
  outcome: ToolOutcome,
  id: string,
  timestamp: number,
): Message {
  const message: Message = {
    id,
    role: "tool",
    kind: "tool",
    content: outcome.content,
    timestamp,
    toolRecord: buildToolRecord(call, outcome),
  };
  if (outcome.attachments) message.attachments = outcome.attachments;
  return message;
}

/** The sentence a file tool's description ends with: the folders it may read. */
export function folderNotice(folders: string[]): string {
  if (folders.length === 0) return "No folders are allowed yet.";
  return `Allowed folders: ${folders.join("; ")}. Always use full paths inside these folders.`;
}

/** A file tool's spec with the folder notice added to its description. Other specs, and the registry, are left as they are. */
export function withFolderNotice(spec: ToolSpec, folders: string[]): ToolSpec {
  if (!FILE_TOOL_NAMES.has(spec.name)) return spec;
  return { ...spec, description: `${spec.description} ${folderNotice(folders)}` };
}

/**
 * The OpenAI tool objects of the tools whose state is not off, in registry order. `web_search` is
 * narrowed to the turned-on sources and left out when none is on. The file tools name the allowed
 * folders in their descriptions.
 */
export function offeredTools(
  specs: ToolSpec[],
  states: Record<string, ToolState>,
  enabledSearchSources: string[],
  searchSources: SearchSourceInfo[],
  allowedFolders: string[],
): ToolDefinition[] {
  const offered = new Set(offeredToolNames(states));
  const narrowed = specs.flatMap((spec) => {
    if (!offered.has(spec.name)) return [];
    const offer = withEnabledSources(spec, enabledSearchSources, searchSources);
    return offer ? [withFolderNotice(offer, allowedFolders)] : [];
  });
  return toToolDefinitions(narrowed);
}

/**
 * True when the model's scan says it does not call tools: a fresh "accepted" or "rejected" result, shown
 * as "Not supported". A missing, untested or stale result allows tools.
 */
export function toolCallsRefused(entries: CapabilityEntry[]): boolean {
  const entry = entries.find((item) => item.key === "toolCalls");
  return entry !== undefined && !entry.stale && entry.status !== "works";
}

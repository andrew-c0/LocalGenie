import type { ChatToolCall, Message, ToolApproval, ToolRecord, ToolStatus } from "../types";

const TOOL_STATUSES: readonly ToolStatus[] = ["ok", "error", "denied", "cancelled"];
const TOOL_APPROVALS: readonly ToolApproval[] = ["auto", "once", "chat"];

/** Shown in place of a result's text when the result is empty. */
const EMPTY_RESULT = "(no output)";

/** The parsed value of a JSON string, or undefined when it is missing or not valid JSON. */
function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return options.some((option) => option === value);
}

function isToolCall(value: unknown): value is ChatToolCall {
  return (
    isRecordObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.arguments === "string"
  );
}

/**
 * The JSON object in `raw`, or null when it is not one. Used for the arguments a tool call carries
 * and for other stored JSON that may be damaged.
 */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const parsed = parseJson(raw);
  return isRecordObject(parsed) ? parsed : null;
}

/**
 * The tool calls stored on an assistant reply. Anything that is not a list reads as none, and entries
 * that are not calls are skipped. Never throws.
 */
export function parseToolCalls(raw: string | null | undefined): ChatToolCall[] | undefined {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return undefined;
  const calls = parsed.filter(isToolCall);
  return calls.length > 0 ? calls : undefined;
}

/**
 * The record stored on a `tool` row. Undefined when the JSON is damaged or a required field is missing
 * or has the wrong type. Never throws.
 */
export function parseToolRecord(raw: string | null | undefined): ToolRecord | undefined {
  const parsed = parseJson(raw);
  if (!isRecordObject(parsed)) return undefined;
  const { callId, name, arguments: args, status, approval, durationMs, truncated } = parsed;
  if (typeof callId !== "string" || typeof name !== "string" || typeof args !== "string") {
    return undefined;
  }
  if (!isOneOf(status, TOOL_STATUSES) || !isOneOf(approval, TOOL_APPROVALS)) return undefined;

  const record: ToolRecord = { callId, name, arguments: args, status, approval };
  if (typeof durationMs === "number") record.durationMs = durationMs;
  if (typeof truncated === "boolean") record.truncated = truncated;
  return record;
}

/** The JSON stored for a reply's tool calls, or null when it made none. */
export function serialiseToolCalls(calls: ChatToolCall[] | undefined): string | null {
  return calls && calls.length > 0 ? JSON.stringify(calls) : null;
}

/** The JSON stored for a `tool` row's record, or null when there is none. */
export function serialiseToolRecord(record: ToolRecord | undefined): string | null {
  return record ? JSON.stringify(record) : null;
}

/** True for a tool row: the result of one tool call, drawn as a tool line and never a bubble. */
export function isToolMessage(message: Pick<Message, "role" | "kind">): boolean {
  return message.role === "tool" || message.kind === "tool";
}

/**
 * True for a message that is an assistant reply: not a tool row, a system line or an error. Only such
 * a message is the target of a streamed reply or its finish stats.
 */
export function isReplyMessage(message: Pick<Message, "role" | "kind" | "isError">): boolean {
  return (
    message.role === "assistant" &&
    !message.isError &&
    !isToolMessage(message) &&
    message.kind !== "system"
  );
}

/** A call an assistant made, as plain text for a summary transcript. */
export function toolCallText(call: Pick<ChatToolCall, "name" | "arguments">): string {
  return `Called ${call.name} with ${call.arguments.trim() || "{}"}`;
}

/** A tool result as plain text for a summary transcript. Its record names the tool when it is known. */
export function toolResultText(record: ToolRecord | undefined, content: string): string {
  const text = content.trim() || EMPTY_RESULT;
  return `Tool ${record?.name ?? "unknown"} result: ${text}`;
}

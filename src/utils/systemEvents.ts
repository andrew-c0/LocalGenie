import type { Message } from "../types";
import { shortName } from "./format";

/** The type of a system line that says the conversation now uses another model. */
export const MODEL_CHANGED = "model_changed";

/** True for a system line the app added, which is never sent to the model. */
export function isSystemEvent(message: Pick<Message, "kind">): boolean {
  return message.kind === "system";
}

/**
 * The content of a model-change line: a JSON object with the model, its compute target and a plain
 * text version. The plain text is what a line of an unknown type falls back to.
 */
export function modelChangedContent(model: string, compute: string | null): string {
  const name = shortName(model);
  const text = compute ? `Model: ${name} on ${compute.toUpperCase()}` : `Model: ${name}`;
  return JSON.stringify({ text, model, compute });
}

/** The fields of a system line's content. Empty when the content is not a JSON object. */
export function parseSystemContent(content: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The model and compute target a reply was generated on. `compute` is null when it was not kept. */
export interface ReplyTarget {
  model: string;
  compute: string | null;
}

/**
 * True when a prompt sent to `next` follows a change from `previous`: another model, or another compute
 * target. A compute target is compared only when the previous reply kept one.
 */
export function isModelChange(previous: ReplyTarget, next: ReplyTarget): boolean {
  if (previous.model !== next.model) return true;
  return previous.compute !== null && next.compute !== null && previous.compute !== next.compute;
}

/**
 * True when the latest system line before a prompt already says `target`. Such a line is not shown
 * again, even when no reply has come since (for example after a failed send).
 */
export function alreadyShown(earlier: Message[], target: ReplyTarget): boolean {
  const latest = [...earlier].reverse().find((m) => isSystemEvent(m));
  return (
    latest !== undefined && latest.content === modelChangedContent(target.model, target.compute)
  );
}

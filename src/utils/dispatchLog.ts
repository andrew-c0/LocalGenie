import type { Message } from "../types";

/**
 * The console line for one Dispatch request: the prompt and completion tokens the server counted for it, and its
 * time in ms. A value the reply does not carry reads as n/a. The prompt count is only the new part when the server
 * reused its cache, so it stays small as a conversation grows.
 */
export function stepLogLine(step: number, reply: Message | undefined): string {
  const promptTokens = reply?.usage?.promptTokens ?? "n/a";
  const completionTokens = reply?.usage?.completionTokens ?? "n/a";
  const ms = reply?.stats?.totalTime ?? "n/a";
  return `[dispatch] step ${step}: prompt_tokens=${promptTokens}, completion_tokens=${completionTokens}, ms=${ms}`;
}

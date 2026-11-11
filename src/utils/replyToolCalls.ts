import type { ChatToolCall, Message } from "../types";
import { isReplyMessage } from "./toolRecords";

/** The reply a stream's tool calls are attached to. `isNew` is true when it has not been stored yet. */
export interface ReplyWithCalls {
  message: Message;
  isNew: boolean;
}

/**
 * The reply that carries a stream's tool calls. When the stream wrote text, the last message is that
 * reply and it gets the calls. When it wrote no text, no reply exists yet and `fresh` (an empty assistant
 * message) is used instead.
 */
export function replyWithToolCalls(
  last: Message | undefined,
  calls: ChatToolCall[],
  fresh: Message,
): ReplyWithCalls {
  if (last && isReplyMessage(last)) {
    return { message: { ...last, toolCalls: calls }, isNew: false };
  }
  return { message: { ...fresh, toolCalls: calls }, isNew: true };
}

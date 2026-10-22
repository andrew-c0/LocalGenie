/**
 * Splits a streamed assistant reply into its chain-of-thought and its visible answer.
 *
 * Thinking models wrap their reasoning in `<think>…</think>` inside the content. Some chat
 * templates put the opening tag in the prompt, so a `</think>` with no earlier `<think>` closes an
 * implicit block that starts at the beginning of the reply. The reply is re-parsed from the full
 * text on every render, so partial tags at the end of a stream are held back until they can be
 * recognised instead of flashing as answer text.
 */

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

export interface ParsedReply {
  /** Reasoning text from every thinking block, trimmed. */
  thinking: string;
  /** Visible answer text with thinking blocks removed, trimmed. */
  answer: string;
  /** True while a `<think>` block has been opened but not yet closed (still streaming). */
  thinkingOpen: boolean;
}

/** Length of the longest suffix of `text` that is a proper prefix of `tag`. */
function partialTagLength(text: string, tag: string): number {
  for (let len = Math.min(tag.length - 1, text.length); len > 0; len--) {
    if (text.endsWith(tag.slice(0, len))) return len;
  }
  return 0;
}

export function parseThinking(text: string): ParsedReply {
  const thinkingParts: string[] = [];
  const answerParts: string[] = [];
  let rest = text;
  let thinkingOpen = false;

  // Implicit open: a close tag before any open tag ends a block that began before the stream.
  const firstOpen = rest.indexOf(OPEN_TAG);
  const firstClose = rest.indexOf(CLOSE_TAG);
  if (firstClose >= 0 && (firstOpen < 0 || firstClose < firstOpen)) {
    thinkingParts.push(rest.slice(0, firstClose));
    rest = rest.slice(firstClose + CLOSE_TAG.length);
  }

  while (rest.length > 0) {
    const open = rest.indexOf(OPEN_TAG);
    if (open < 0) {
      const held = partialTagLength(rest, OPEN_TAG);
      answerParts.push(rest.slice(0, rest.length - held));
      break;
    }
    answerParts.push(rest.slice(0, open));

    const afterOpen = rest.slice(open + OPEN_TAG.length);
    const close = afterOpen.indexOf(CLOSE_TAG);
    if (close < 0) {
      thinkingParts.push(afterOpen);
      thinkingOpen = true;
      break;
    }
    thinkingParts.push(afterOpen.slice(0, close));
    rest = afterOpen.slice(close + CLOSE_TAG.length);
  }

  return {
    thinking: thinkingParts
      .map((part) => part.trim())
      .filter(Boolean)
      .join("\n\n"),
    answer: answerParts.join("").trim(),
    thinkingOpen,
  };
}

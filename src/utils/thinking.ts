/**
 * Splits a streamed assistant reply into its chain-of-thought and its visible answer.
 *
 * The markers come from `shared/thinking-patterns.json`, the same file the model scan reads in
 * Rust (`parse_thinking` in `capability_scan.rs`). Both sides follow the rules in that file's
 * header and in `shared/thinking-cases.json`, which both test suites check.
 *
 * Some chat templates put the opening tag in the prompt, so a close tag with no earlier open tag
 * closes an implicit block that starts at the beginning of the reply. The reply is re-parsed from
 * the full text on every render, so partial tags at the end of a stream are held back until they
 * can be recognised instead of flashing as answer text.
 */

import patternFile from "../../shared/thinking-patterns.json";

interface ThinkingPattern {
  open: string;
  close: string;
}

/** A marker with no block: removed from the answer and never counted as thinking. */
interface Marker {
  at: number;
  length: number;
  /** Set when the marker opens a block. */
  pattern?: ThinkingPattern;
}

const PATTERNS: ThinkingPattern[] = patternFile.patterns.filter((p) => p.open && p.close);
const STRIP_ONLY: string[] = patternFile.stripOnly.map((m) => m.text).filter(Boolean);
const ALL_TAGS: string[] = [...PATTERNS.flatMap((p) => [p.open, p.close]), ...STRIP_ONLY];

export interface ParsedReply {
  /** Reasoning text from every thinking block, trimmed. */
  thinking: string;
  /** Visible answer text with thinking blocks removed, trimmed. */
  answer: string;
  /** True while a thinking block has been opened but not yet closed (still streaming). */
  thinkingOpen: boolean;
}

/** Length of the longest suffix of `text` that is a proper prefix of any known tag. */
function heldBackLength(text: string): number {
  let held = 0;
  for (const tag of ALL_TAGS) {
    for (let len = Math.min(tag.length - 1, text.length); len > held; len--) {
      if (text.endsWith(tag.slice(0, len))) {
        held = len;
        break;
      }
    }
  }
  return held;
}

/** Index of the first of `needles` in `text`, or `Infinity` when none occurs. */
function firstIndexOf(text: string, needles: string[]): number {
  let first = Infinity;
  for (const needle of needles) {
    const at = text.indexOf(needle);
    if (at >= 0 && at < first) first = at;
  }
  return first;
}

/** The block-free marker that comes first in `text`. Ties go to the longer marker. */
function nextMarker(text: string): Marker | undefined {
  const found: Marker[] = [];
  for (const pattern of PATTERNS) {
    const at = text.indexOf(pattern.open);
    if (at >= 0) found.push({ at, length: pattern.open.length, pattern });
  }
  for (const tag of STRIP_ONLY) {
    const at = text.indexOf(tag);
    if (at >= 0) found.push({ at, length: tag.length });
  }
  return found.sort((a, b) => a.at - b.at || b.length - a.length)[0];
}

/**
 * The implicit block at the start of the reply: the close tag of a pattern that comes before that
 * pattern's open tag. Not taken when a strip-only marker comes before the close tag, so a final
 * channel is not read as thinking.
 */
function implicitClose(text: string): { at: number; close: string } | undefined {
  const stripAt = firstIndexOf(text, STRIP_ONLY);
  let best: { at: number; close: string } | undefined;
  for (const pattern of PATTERNS) {
    const at = text.indexOf(pattern.close);
    if (at < 0 || stripAt < at) continue;
    const open = text.indexOf(pattern.open);
    if (open >= 0 && open < at) continue;
    if (!best || at < best.at) best = { at, close: pattern.close };
  }
  return best;
}

export function parseThinking(text: string): ParsedReply {
  const thinkingParts: string[] = [];
  const answerParts: string[] = [];
  let rest = text;
  let thinkingOpen = false;

  const implicit = implicitClose(rest);
  if (implicit) {
    thinkingParts.push(rest.slice(0, implicit.at));
    rest = rest.slice(implicit.at + implicit.close.length);
  }

  while (rest.length > 0) {
    const marker = nextMarker(rest);
    if (!marker) {
      answerParts.push(rest.slice(0, rest.length - heldBackLength(rest)));
      break;
    }
    answerParts.push(rest.slice(0, marker.at));
    rest = rest.slice(marker.at + marker.length);
    if (!marker.pattern) continue;

    const close = rest.indexOf(marker.pattern.close);
    if (close < 0) {
      thinkingParts.push(rest.slice(0, rest.length - heldBackLength(rest)));
      thinkingOpen = true;
      break;
    }
    thinkingParts.push(rest.slice(0, close));
    rest = rest.slice(close + marker.pattern.close.length);
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

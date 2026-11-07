/**
 * The leading YAML front matter of a model card: a `---` line, the metadata, then a closing `---` line. The
 * Hub reads it as metadata, so the page shows the text after it. Anchored to the start of the text.
 */
const FRONT_MATTER = /^﻿?---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** A model card's markdown without its leading front matter. Text with no front matter comes back as it is. */
export function stripFrontMatter(markdown: string): string {
  return markdown.replace(FRONT_MATTER, "");
}

/** The share of the context window one tool result may take. */
export const RESULT_WINDOW_SHARE = 0.15;

/** Characters per token used to turn the window into characters. Low on purpose, so a result never overflows. */
export const RESULT_CHARS_PER_TOKEN = 3.5;

/** The smallest budget: a result is never cut below this many characters. */
export const RESULT_MIN_CHARS = 1500;

/** The largest budget, the same cap the backend allows. */
export const RESULT_MAX_CHARS = 40000;

/**
 * The longest a tool result may be, in characters, for a model with this context window: 15% of the window, at
 * 3.5 characters per token, kept between 1,500 and 40,000. Undefined when the window is not known, so the backend's
 * default applies.
 */
export function resultBudgetChars(
  contextWindowTokens: number | null | undefined,
): number | undefined {
  if (contextWindowTokens == null || !Number.isFinite(contextWindowTokens)) return undefined;
  if (contextWindowTokens <= 0) return undefined;
  const chars = Math.round(contextWindowTokens * RESULT_WINDOW_SHARE * RESULT_CHARS_PER_TOKEN);
  return Math.min(RESULT_MAX_CHARS, Math.max(RESULT_MIN_CHARS, chars));
}

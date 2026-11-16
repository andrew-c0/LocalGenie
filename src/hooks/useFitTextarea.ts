import { type RefObject, useEffect } from "react";

/**
 * Fits a textarea to its text: one row up to `maxRows`, then it scrolls. Runs whenever the text changes,
 * including after a send clears it.
 */
export function useFitTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  text: string,
  maxRows: number,
): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: text is the trigger, the height is read from the DOM
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const computed = getComputedStyle(el);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
    const chrome =
      Number.parseFloat(computed.paddingTop) +
      Number.parseFloat(computed.paddingBottom) +
      Number.parseFloat(computed.borderTopWidth) +
      Number.parseFloat(computed.borderBottomWidth);
    const maxHeight = lineHeight * maxRows + chrome;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [ref, text, maxRows]);
}

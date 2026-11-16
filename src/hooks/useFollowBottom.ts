import { type RefObject, type UIEvent, useEffect, useRef } from "react";
import { isNearBottom } from "../utils/scroll";

/**
 * Keeps a scrolling list at its newest item. The view follows new content while the user is near the
 * bottom; a scroll up stops following until the view is back at the bottom. A new `viewKey` (another
 * conversation or task) and a new user message follow again. Scrolling is instant: smooth scrolling
 * falls behind fast token output.
 *
 * Attach `onScroll` to the scrolling element and `bottomRef` to an empty element at its end.
 */
export function useFollowBottom(
  viewKey: string,
  triggers: readonly unknown[],
  lastFromUser: boolean,
): {
  bottomRef: RefObject<HTMLDivElement | null>;
  onScroll: (event: UIEvent<HTMLElement>) => void;
} {
  const bottomRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: opening another view is the trigger
  useEffect(() => {
    followRef.current = true;
  }, [viewKey]);

  useEffect(() => {
    if (lastFromUser) followRef.current = true;
    if (followRef.current) bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [...triggers, lastFromUser]);

  const onScroll = (event: UIEvent<HTMLElement>) => {
    followRef.current = isNearBottom(event.currentTarget);
  };

  return { bottomRef, onScroll };
}

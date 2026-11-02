/** Distance from the bottom, in pixels, within which a view counts as at the bottom. */
const NEAR_BOTTOM_PX = 48;

/** True when a scroll position is at the bottom, give or take `NEAR_BOTTOM_PX`. */
export function isNearBottom(
  el: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
}

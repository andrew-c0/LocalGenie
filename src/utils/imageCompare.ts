/** The comparison divider's position, as a percentage of the picture box's width. */
export const COMPARE_START_PERCENT = 50;

/** Arrow keys move the divider by this many percent; with Shift they move by the larger step. */
export const COMPARE_KEY_STEP = 2;
export const COMPARE_KEY_STEP_SHIFT = 10;

/** Keeps a percentage between 0 and 100. A value that is not a number counts as 0. */
export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * The divider position for a pointer at `clientX`, given the box's left edge and width. A box with no width
 * has nothing to measure from, so the position is 0 instead of a division by zero.
 */
export function percentFromPointer(clientX: number, left: number, width: number): number {
  if (width <= 0) return 0;
  return clampPercent(((clientX - left) / width) * 100);
}

/**
 * The divider position after a key press on the slider, or null when the key is not one the slider handles.
 * Home and End jump to the ends; the arrows move by the step.
 */
export function percentFromKey(current: number, key: string, shiftKey: boolean): number | null {
  const step = shiftKey ? COMPARE_KEY_STEP_SHIFT : COMPARE_KEY_STEP;
  switch (key) {
    case "ArrowLeft":
      return clampPercent(current - step);
    case "ArrowRight":
      return clampPercent(current + step);
    case "Home":
      return 0;
    case "End":
      return 100;
    default:
      return null;
  }
}

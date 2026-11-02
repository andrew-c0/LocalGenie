import type { SpinButtonOnChangeData } from "@fluentui/react-components";

/**
 * The number a SpinButton change carries, or null when the field was cleared or holds no number.
 *
 * A controlled SpinButton reports a typed number only as `displayValue` (its `value` is undefined),
 * while the arrow buttons report `value`. Reading `value` alone drops everything the user types.
 * A typed number is clamped to `min` and `max` when they are given.
 */
export function spinNumber(
  data: SpinButtonOnChangeData,
  min?: number,
  max?: number,
): number | null {
  let value = data.value;
  if (value == null) {
    const text = data.displayValue?.trim();
    if (!text) return null;
    const parsed = Number(text);
    if (Number.isNaN(parsed)) return null;
    value = parsed;
  }
  if (min != null && value < min) value = min;
  if (max != null && value > max) value = max;
  return value;
}

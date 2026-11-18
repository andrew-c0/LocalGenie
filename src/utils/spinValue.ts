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

/**
 * The text a SpinButton shows for a number, with a fixed count of decimals. Fluent rounds a SpinButton's shown value
 * to the decimals of its `step`, so a field with a 0.1 step would read 1.05 as 1.1; passing this as `displayValue`
 * keeps every decimal the field's step allows.
 */
export function spinDisplayValue(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

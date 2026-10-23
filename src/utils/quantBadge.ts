import type { BadgeProps } from "@fluentui/react-components";

export type QuantBadgeColor = NonNullable<BadgeProps["color"]>;

/**
 * Quantization width → badge colour (lower bits = more compressed). Shared by the download picker and
 * the model selector rows so the same precision always gets the same colour.
 */
export const bitsBadgeColor = (bits: number): QuantBadgeColor =>
  bits <= 4 ? "success" : bits <= 6 ? "warning" : bits <= 8 ? "informative" : "important";

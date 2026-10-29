import type { ProgressBarProps } from "@fluentui/react-components";
import { ProgressBar as FluentProgressBar } from "@fluentui/react-components";

export type ProgressTone = "cyan" | "purple" | "green";

const PROGRESS_COLOR: Record<ProgressTone, NonNullable<ProgressBarProps["color"]>> = {
  cyan: "brand",
  purple: "brand",
  green: "success",
};

/** Progress bar; `value` is 0–100 and is clamped. Null draws an indeterminate bar, for work with no known length. */
export function ProgressBar({ value, color }: { value: number | null; color?: ProgressTone }) {
  const fraction = value === null ? undefined : Math.max(0, Math.min(100, value)) / 100;
  return <FluentProgressBar value={fraction} color={color ? PROGRESS_COLOR[color] : undefined} />;
}

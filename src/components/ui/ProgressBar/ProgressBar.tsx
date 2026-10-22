import type { ProgressBarProps } from "@fluentui/react-components";
import { ProgressBar as FluentProgressBar } from "@fluentui/react-components";
import type { CSSProperties } from "react";

export type ProgressTone = "cyan" | "purple" | "green";

const PROGRESS_COLOR: Record<ProgressTone, NonNullable<ProgressBarProps["color"]>> = {
  cyan: "brand",
  purple: "brand",
  green: "success",
};

/** Progress bar; `value` is 0–100 and is clamped. */
export function ProgressBar({
  value,
  color,
  style,
}: {
  value: number;
  color?: ProgressTone;
  style?: CSSProperties;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <FluentProgressBar
      value={clamped / 100}
      color={color ? PROGRESS_COLOR[color] : undefined}
      style={style}
    />
  );
}

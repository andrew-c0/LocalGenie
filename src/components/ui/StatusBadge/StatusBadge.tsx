import type { BadgeProps } from "@fluentui/react-components";
import { Badge } from "@fluentui/react-components";
import type { ReactNode } from "react";

export type BadgeTone = "default" | "blue" | "cyan" | "purple" | "green" | "red";

const BADGE_COLOR: Record<BadgeTone, NonNullable<BadgeProps["color"]>> = {
  default: "subtle",
  blue: "informative",
  cyan: "brand",
  purple: "brand",
  green: "success",
  red: "danger",
};

/** Small status pill. */
export function StatusBadge({
  tone = "default",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <Badge appearance="tint" color={BADGE_COLOR[tone]}>
      {children}
    </Badge>
  );
}

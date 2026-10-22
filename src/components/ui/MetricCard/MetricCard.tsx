import { Caption1, Text } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { ProgressBar, type ProgressTone } from "../ProgressBar/ProgressBar";
import { SurfaceCard } from "../SurfaceCard/SurfaceCard";

/** Metric card with a large value, unit suffix and optional progress bar. */
export function MetricCard({
  label,
  value,
  unit,
  sub,
  badge,
  progress,
  progressColor,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  badge?: ReactNode;
  /** 0–100, renders a progress bar when provided. */
  progress?: number;
  progressColor?: ProgressTone;
}) {
  return (
    <SurfaceCard
      title={
        <>
          {label}
          {badge}
        </>
      }
    >
      <div>
        <Text size={600} weight="semibold">
          {value}
        </Text>
        {unit && <Caption1> {unit}</Caption1>}
      </div>
      {typeof progress === "number" && <ProgressBar value={progress} color={progressColor} />}
      {sub && <Caption1>{sub}</Caption1>}
    </SurfaceCard>
  );
}

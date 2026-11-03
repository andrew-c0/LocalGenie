import type { ComputeTarget } from "../../../../types";
import { COMPUTE_COLOR } from "../../../../utils/computeColors";
import { USAGE_TARGET_LABEL } from "../../../../utils/usageTargets";
import { Flex } from "../../../ui/Flex/Flex";
import { Body, BodyStrong } from "../../../ui/Typography/Typography";
import "./UsageLegend.css";

export interface UsageLegendRow {
  target: ComputeTarget;
  /** Latest reading in percent. Null before the first sample. */
  latest: number | null;
}

/** Colour key and latest percentage for each plotted target. */
export function UsageLegend({ rows }: { rows: UsageLegendRow[] }) {
  return (
    <Flex direction="column" gap="xs">
      {rows.map(({ target, latest }) => (
        <Flex key={target} justify="between" align="center">
          <Flex align="center" gap="xs">
            <span
              className="usage-legend__swatch"
              style={{ backgroundColor: COMPUTE_COLOR[target] }}
            />
            <BodyStrong>{USAGE_TARGET_LABEL[target]}</BodyStrong>
          </Flex>
          <Body>{latest === null ? "n/a" : `${Math.round(latest)}%`}</Body>
        </Flex>
      ))}
    </Flex>
  );
}

import { AreaChart, type ChartProps } from "@fluentui/react-charts";
import { Card, Tooltip } from "@fluentui/react-components";
import { useModelStore } from "../../../stores/modelStore";
import { COMPUTE_COLOR } from "../../../utils/computeColors";
import { targetsWithReadings, USAGE_TARGET_LABEL } from "../../../utils/usageTargets";
import { Flex } from "../../ui/Flex/Flex";
import { Meta } from "../../ui/Typography/Typography";
import { RamUsage } from "./RamUsage";
import { UsageLegend, type UsageLegendRow } from "./UsageLegend/UsageLegend";
import { USAGE_HISTORY_LENGTH, USAGE_SAMPLE_SECONDS, useSystemUsage } from "./useSystemUsage";
import { useModelLoaded, usePlaygroundJobRunning, useUsageTargets } from "./useUsageSources";
import "./SystemUsage.css";

const CHART_WIDTH = 176;
const CHART_HEIGHT = 80;
const CHART_TOOLTIP = `Last ${USAGE_HISTORY_LENGTH} s · sampled every ${USAGE_SAMPLE_SECONDS} s`;

/**
 * Live usage card for the sidebar footer. Shown while a GenieX model is loaded or a Playground job
 * runs; with neither it renders nothing and does not poll the backend. Unmounting resets the history,
 * so each load or job starts fresh.
 */
export function SystemUsage() {
  const modelLoaded = useModelLoaded();
  const playgroundRunning = usePlaygroundJobRunning();
  if (!modelLoaded && !playgroundRunning) return null;
  return <UsageCard modelLoaded={modelLoaded} />;
}

/** The chart, one line per target in use, the legend and the RAM section. */
function UsageCard({ modelLoaded }: { modelLoaded: boolean }) {
  const serverPort = useModelStore((s) => s.serverPort);
  const targets = useUsageTargets();
  const samples = useSystemUsage(serverPort);
  const lastSample = samples.length > 0 ? samples[samples.length - 1] : null;
  // Before the first sample every target is listed; after it, only the targets the host reports.
  const plottedTargets = lastSample ? targetsWithReadings(targets, lastSample) : targets;

  const chartData: ChartProps = {
    lineChartData: plottedTargets.map((target) => ({
      legend: USAGE_TARGET_LABEL[target],
      color: COMPUTE_COLOR[target],
      data: samples.map((sample, index) => ({ x: index, y: sample[target] ?? 0 })),
    })),
  };

  const legendRows: UsageLegendRow[] = plottedTargets.map((target) => ({
    target,
    latest: lastSample?.[target] ?? null,
  }));

  return (
    <Card size="large">
      <Flex direction="column" gap="m">
        <Flex direction="column" gap="xs">
          {lastSample && plottedTargets.length === 0 ? (
            <Meta>Usage is not available on this device.</Meta>
          ) : (
            <Tooltip content={CHART_TOOLTIP} relationship="description" withArrow>
              <div className="system-usage__chart">
                <AreaChart
                  data={chartData}
                  width={CHART_WIDTH}
                  height={CHART_HEIGHT}
                  margins={{ top: 2, right: 2, bottom: 2, left: 2 }}
                  yMinValue={0}
                  yMaxValue={100}
                  yAxisTickCount={2}
                  yAxisTickFormat={() => ""}
                  tickValues={[]}
                  hideLegend
                  hideTooltip
                />
              </div>
            </Tooltip>
          )}
          <UsageLegend rows={legendRows} />
        </Flex>
        {lastSample && <RamUsage sample={lastSample} modelLoaded={modelLoaded} />}
      </Flex>
    </Card>
  );
}

import { AreaChart, type ChartProps } from "@fluentui/react-charts";
import { Card, Divider, Tooltip } from "@fluentui/react-components";
import { useModelStore } from "../../../stores/modelStore";
import { Flex } from "../../ui/Flex/Flex";
import { ProgressBar } from "../../ui/ProgressBar/ProgressBar";
import { Body, BodyStrong, Meta } from "../../ui/Typography/Typography";
import { useContextMemory } from "./useContextMemory";
import { useContextWindow } from "./useContextWindow";
import { USAGE_HISTORY_LENGTH, USAGE_SAMPLE_SECONDS, useSystemUsage } from "./useSystemUsage";
import "./SystemUsage.css";
import { COMPUTE_COLOR } from "../../../utils/computeColors";

const CHART_WIDTH = 176;
const CHART_HEIGHT = 80;
const TARGET_LABEL = { cpu: "CPU", gpu: "GPU", npu: "NPU" } as const;
/** Stroke per target: CPU cyan, GPU orange, NPU magenta. */
const LINE_COLOR = COMPUTE_COLOR;
const CHART_TOOLTIP = `Last ${USAGE_HISTORY_LENGTH} s · sampled every ${USAGE_SAMPLE_SECONDS} s`;
const BYTES_PER_GB = 1_073_741_824;

/** Memory in GB with one decimal, for example `16.3 GB`. `—` when unknown. */
function formatGb(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  return `${(bytes / BYTES_PER_GB).toFixed(1)} GB`;
}

/**
 * Live usage chart for the sidebar footer. Shown only while a model is loaded: with none loaded it
 * renders nothing and does not poll the backend. Unmounting resets the history, so each load starts
 * fresh.
 */
export function SystemUsage() {
  const modelLoaded = useModelStore((s) => s.serverStatus.models.length > 0);
  if (!modelLoaded) return null;
  return <UsageChart />;
}

/** The chart itself. It follows the compute target the loaded model was loaded on. */
function UsageChart() {
  const loadedCompute = useModelStore((s) => s.loadedCompute);
  const defaultCompute = useModelStore((s) => s.compute);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const serverPort = useModelStore((s) => s.serverPort);
  const samples = useSystemUsage(serverPort);
  const contextWindow = useContextWindow(activeModelId);
  const contextBytes = useContextMemory(activeModelId, contextWindow);

  const target = loadedCompute ?? defaultCompute;
  const series = samples.map((sample) => sample[target]);
  const latest = series.length > 0 ? series[series.length - 1] : null;
  const lastSample = samples.length > 0 ? samples[samples.length - 1] : null;
  const ramPercent =
    lastSample && lastSample.memoryTotalBytes > 0
      ? (lastSample.memoryUsedBytes / lastSample.memoryTotalBytes) * 100
      : null;

  const chartData: ChartProps = {
    lineChartData: [
      {
        legend: TARGET_LABEL[target],
        color: LINE_COLOR[target],
        data: series.map((value, index) => ({ x: index, y: value ?? 0 })),
      },
    ],
  };

  return (
    <Card size="large">
      <Flex direction="column" gap="m">
        <Flex direction="column" gap="xs">
          {latest === null && samples.length > 0 ? (
            <Meta>{TARGET_LABEL[target]} usage is not available on this device.</Meta>
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
          <Flex justify="between" align="center">
            <Flex align="center" gap="xs">
              <span
                className="system-usage__swatch"
                style={{ backgroundColor: LINE_COLOR[target] }}
              />
              <BodyStrong>{TARGET_LABEL[target]}</BodyStrong>
            </Flex>
            <Body>{latest === null ? "n/a" : `${Math.round(latest)}%`}</Body>
          </Flex>
        </Flex>
        {lastSample && ramPercent !== null && (
          <>
            <Divider />
            <Flex direction="column" gap="xs">
              <Flex justify="between" align="center">
                <BodyStrong>RAM</BodyStrong>
                <Body>{Math.round(ramPercent)}%</Body>
              </Flex>
              <ProgressBar value={ramPercent} />
              <Flex direction="column" gap="xs">
                <Flex justify="between" align="center">
                  <Meta>System</Meta>
                  <Meta>
                    {formatGb(lastSample.memoryUsedBytes)} / {formatGb(lastSample.memoryTotalBytes)}
                  </Meta>
                </Flex>
                <Flex justify="between" align="center">
                  <Meta>Model / context</Meta>
                  <Meta>
                    {formatGb(lastSample.modelMemoryBytes)} / {formatGb(contextBytes)}
                  </Meta>
                </Flex>
              </Flex>
            </Flex>
          </>
        )}
      </Flex>
    </Card>
  );
}

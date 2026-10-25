import { LineChart, VerticalBarChart } from "@fluentui/react-charts";
import { useEffect, useRef, useState } from "react";
import type { ComputeTarget } from "../../../types";
import type { Group, RunSeries, TimeSeries } from "../../../utils/compare";
import { COMPUTE_COLOR } from "../../../utils/computeColors";
import "./CompareChart.css";

const HEIGHT = 320;

/** Legends toggle one at a time by default; this lets several series be shown together. */
const LEGEND_PROPS = { canSelectMultipleLegends: true };

/** Width of the chart's box, followed as the box is resized. */
function useBoxWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(box);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

interface CompareChartProps {
  /**
   * `bars`: one bar per model or compute target. `runs`: one line per series, each run at its place
   * in start order. `time`: one line per series, each run at its start time.
   */
  mode: "bars" | "runs" | "time";
  /** Bars take their colour from the compute target when the groups are compute targets. */
  colorByCompute: boolean;
  groups: Group[];
  runSeries: RunSeries[];
  timeSeries: TimeSeries[];
  /** Name of the figure, shown as the title and the axis label. */
  metricLabel: string;
}

/**
 * The comparison chart. Compute targets use the same colours as the usage graph. Fluent charts draw
 * SVG, so the page can export the chart as an image.
 */
export function CompareChart({
  mode,
  colorByCompute,
  groups,
  runSeries,
  timeSeries,
  metricLabel,
}: CompareChartProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const width = useBoxWidth(boxRef);

  return (
    <div ref={boxRef} className="compare-chart">
      {width > 0 &&
        (mode === "bars" ? (
          <VerticalBarChart
            width={width}
            height={HEIGHT}
            legendProps={LEGEND_PROPS}
            yAxisTitle={metricLabel}
            data={groups.map((g) => ({
              x: g.key,
              y: g.mean,
              legend: g.key,
              color: colorByCompute
                ? COMPUTE_COLOR[g.key.toLowerCase() as ComputeTarget]
                : undefined,
            }))}
          />
        ) : mode === "runs" ? (
          <LineChart
            width={width}
            height={HEIGHT}
            legendProps={LEGEND_PROPS}
            yAxisTitle={metricLabel}
            xAxisTitle="Run number"
            data={{
              chartTitle: metricLabel,
              lineChartData: runSeries.map((s) => ({
                legend: s.legend,
                color: COMPUTE_COLOR[s.compute],
                data: s.points.map((p) => ({
                  x: p.x,
                  y: p.y,
                  xAxisCalloutData: p.label,
                })),
              })),
            }}
          />
        ) : (
          <LineChart
            width={width}
            height={HEIGHT}
            legendProps={LEGEND_PROPS}
            yAxisTitle={metricLabel}
            xAxisTitle="Started"
            data={{
              chartTitle: metricLabel,
              lineChartData: timeSeries.map((s) => ({
                legend: s.legend,
                color: COMPUTE_COLOR[s.compute],
                data: s.points.map((p) => ({ x: p.x, y: p.y })),
              })),
            }}
          />
        ))}
    </div>
  );
}

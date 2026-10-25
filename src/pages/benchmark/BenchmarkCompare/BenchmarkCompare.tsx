import { Button, Dropdown, Field, Option, Spinner } from "@fluentui/react-components";
import { ArrowDownloadRegular, DismissRegular } from "@fluentui/react-icons";
import { useMemo, useRef, useState } from "react";
import { CompareChart } from "../../../components/benchmark/CompareChart/CompareChart";
import { ExportToastBody } from "../../../components/benchmark/ExportToastBody/ExportToastBody";
import { ChipRow } from "../../../components/ui/ChipRow/ChipRow";
import { ErrorBanner } from "../../../components/ui/ErrorBanner/ErrorBanner";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { SurfaceCard } from "../../../components/ui/SurfaceCard/SurfaceCard";
import { Meta } from "../../../components/ui/Typography/Typography";
import { saveBenchmarkImage } from "../../../services/benchmark";
import { type CompareGroupBy, useBenchmarkUiStore } from "../../../stores/benchmarkUiStore";
import { svgToPngBase64 } from "../../../utils/chartImage";
import {
  type CompareMetric,
  groupRuns,
  METRICS,
  runSeries,
  timeSeries,
} from "../../../utils/compare";
import { errorMessage } from "../../../utils/errorMessage";
import { fileStamp } from "../../../utils/fileStamp";
import { toast } from "../../../utils/toast";
import { useBenchmarkRuns } from "../BenchmarkRuns/useBenchmarkRuns";
import "./BenchmarkCompare.css";

const GROUPS: [CompareGroupBy, string][] = [
  ["model", "By model"],
  ["compute", "By compute"],
  ["run", "By run"],
  ["time", "Over time"],
];

/**
 * Compare the runs ticked on the Runs tab. Bars show each model or compute target's mean, with the
 * spread across its runs in the table. "By run" puts runs in order, one after another; "Over time"
 * places them at their start times.
 */
export default function BenchmarkCompare() {
  const { runs, error } = useBenchmarkRuns();
  const selectedIds = useBenchmarkUiStore((s) => s.selectedRunIds);
  const setSelectedRunIds = useBenchmarkUiStore((s) => s.setSelectedRunIds);
  const metric = useBenchmarkUiStore((s) => s.compareMetric);
  const setMetric = useBenchmarkUiStore((s) => s.setCompareMetric);
  const groupBy = useBenchmarkUiStore((s) => s.compareGroupBy);
  const setGroupBy = useBenchmarkUiStore((s) => s.setCompareGroupBy);
  const [exporting, setExporting] = useState(false);
  const chartBox = useRef<HTMLDivElement>(null);

  const usingSelection = selectedIds.length > 0;
  const chosen = useMemo(
    () =>
      (runs ?? []).filter((r) =>
        usingSelection ? selectedIds.includes(r.id) : r.status === "completed",
      ),
    [runs, selectedIds, usingSelection],
  );

  const info = METRICS[metric];
  const label = `${info.label} (${info.unit})`;
  const isBars = groupBy === "model" || groupBy === "compute";
  const groups = useMemo(
    () => (isBars ? groupRuns(chosen, metric, groupBy) : []),
    [chosen, metric, groupBy, isBars],
  );
  const lines = useMemo(
    () => (groupBy === "run" ? runSeries(chosen, metric) : []),
    [chosen, metric, groupBy],
  );
  const dated = useMemo(
    () => (groupBy === "time" ? timeSeries(chosen, metric) : []),
    [chosen, metric, groupBy],
  );
  const hasData = isBars
    ? groups.length > 0
    : groupBy === "run"
      ? lines.length > 0
      : dated.length > 0;
  const chartMode = isBars ? "bars" : groupBy === "run" ? "runs" : "time";

  const handleExport = async () => {
    const svg = chartBox.current?.querySelector("svg");
    if (!svg) {
      toast.error("Nothing to export", "The chart is not drawn yet.");
      return;
    }
    const background = getComputedStyle(document.body).backgroundColor || "#202020";
    setExporting(true);
    try {
      const data = await svgToPngBase64(svg, background);
      const path = await saveBenchmarkImage(
        data,
        `benchmark-${metric}-${fileStamp(new Date())}.png`,
      );
      if (path) toast.success("Chart exported", <ExportToastBody path={path} />);
    } catch (e) {
      toast.error("Could not export the chart", errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <SurfaceCard
      title="Compare"
      action={
        <div className="benchmark-compare__actions">
          {usingSelection && (
            <Button
              appearance="secondary"
              icon={<DismissRegular />}
              iconPosition="after"
              aria-label="Clear the selected runs"
              onClick={() => setSelectedRunIds([])}
            >
              {selectedIds.length} selected
            </Button>
          )}
          <Button
            appearance="secondary"
            icon={<ArrowDownloadRegular />}
            disabled={!hasData || exporting}
            onClick={() => void handleExport()}
          >
            Export PNG
          </Button>
        </div>
      }
    >
      {error && <ErrorBanner message={error} />}
      {!error && runs === null && <Spinner size="tiny" label="Loading runs" />}

      {runs !== null && (
        <div className="benchmark-compare">
          <Meta>
            {usingSelection
              ? `${chosen.length} selected run${chosen.length === 1 ? "" : "s"}`
              : "No runs selected: showing every completed run. Tick runs on the Runs tab to compare them."}
          </Meta>

          <div className="benchmark-compare__controls">
            <Field label="Figure">
              <Dropdown
                aria-label="Figure to compare"
                value={info.label}
                selectedOptions={[metric]}
                onOptionSelect={(_, d) => {
                  if (d.optionValue) setMetric(d.optionValue as CompareMetric);
                }}
              >
                {(Object.keys(METRICS) as CompareMetric[]).map((key) => (
                  <Option key={key} value={key} text={METRICS[key].label}>
                    {METRICS[key].label}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <ChipRow<CompareGroupBy>
              ariaLabel="Group by"
              options={GROUPS}
              value={groupBy}
              onChange={setGroupBy}
            />
          </div>

          {hasData ? (
            <div ref={chartBox}>
              <CompareChart
                mode={chartMode}
                colorByCompute={groupBy === "compute"}
                groups={groups}
                runSeries={lines}
                timeSeries={dated}
                metricLabel={label}
              />
            </div>
          ) : (
            <StateBlock message="No runs have a figure for this measure yet." />
          )}

          {isBars && groups.length > 0 && (
            <table className="benchmark-compare__table">
              <thead>
                <tr>
                  <th>{groupBy === "model" ? "Model" : "Compute"}</th>
                  <th>Runs</th>
                  <th>Mean</th>
                  <th>Min</th>
                  <th>Max</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.key}>
                    <td>{g.key}</td>
                    <td>{g.runs}</td>
                    <td>{g.mean.toFixed(2)}</td>
                    <td>{g.min.toFixed(2)}</td>
                    <td>{g.max.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </SurfaceCard>
  );
}

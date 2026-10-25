import {
  Button,
  createTableColumn,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Dropdown,
  Field,
  Option,
  Spinner,
  TableCellLayout,
  type TableColumnDefinition,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, DataBarVerticalRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExportToastBody } from "../../../components/benchmark/ExportToastBody/ExportToastBody";
import { ChipRow } from "../../../components/ui/ChipRow/ChipRow";
import { ErrorBanner } from "../../../components/ui/ErrorBanner/ErrorBanner";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { SurfaceCard } from "../../../components/ui/SurfaceCard/SurfaceCard";
import { Meta } from "../../../components/ui/Typography/Typography";
import { saveBenchmarkExport } from "../../../services/benchmark";
import { useBenchmarkUiStore } from "../../../stores/benchmarkUiStore";
import type { BenchmarkRunSummary, ComputeTarget } from "../../../types";
import { runsCsv } from "../../../utils/benchmarkRunsCsv";
import { errorMessage } from "../../../utils/errorMessage";
import { fileStamp } from "../../../utils/fileStamp";
import { toast } from "../../../utils/toast";
import { useBenchmarkRuns } from "./useBenchmarkRuns";
import "./BenchmarkRuns.css";

const ALL = "all";

function fixed(value: number | null, digits: number): string {
  return value === null ? "—" : value.toFixed(digits);
}

function gigabytes(bytes: number | null): string {
  return bytes === null ? "—" : `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function when(ms: number): string {
  return new Date(ms).toLocaleString();
}

/** Keyword result as "passed / checked", or a dash when no keyword check was made. */
function keywords(run: BenchmarkRunSummary): string {
  const m = run.metrics;
  return m.keywordChecked === 0 ? "—" : `${m.keywordPassed} / ${m.keywordChecked}`;
}

function compareNumbers(a: number | null, b: number | null): number {
  return (a ?? Number.NEGATIVE_INFINITY) - (b ?? Number.NEGATIVE_INFINITY);
}

const COLUMNS: TableColumnDefinition<BenchmarkRunSummary>[] = [
  createTableColumn<BenchmarkRunSummary>({
    columnId: "started",
    compare: (a, b) => a.startedAt - b.startedAt,
    renderHeaderCell: () => "Started",
    renderCell: (run) => <TableCellLayout>{when(run.startedAt)}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "suite",
    compare: (a, b) => a.suiteName.localeCompare(b.suiteName),
    renderHeaderCell: () => "Suite",
    renderCell: (run) => <TableCellLayout>{run.suiteName}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "model",
    compare: (a, b) => a.modelName.localeCompare(b.modelName),
    renderHeaderCell: () => "Model",
    renderCell: (run) => <TableCellLayout>{run.modelName}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "compute",
    compare: (a, b) => a.compute.localeCompare(b.compute),
    renderHeaderCell: () => "Compute",
    renderCell: (run) => <TableCellLayout>{run.compute.toUpperCase()}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "status",
    compare: (a, b) => a.status.localeCompare(b.status),
    renderHeaderCell: () => "Status",
    renderCell: (run) => <TableCellLayout>{run.status}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "ttft",
    compare: (a, b) => compareNumbers(a.metrics.meanTtftMs, b.metrics.meanTtftMs),
    renderHeaderCell: () => "TTFT (ms)",
    renderCell: (run) => <TableCellLayout>{fixed(run.metrics.meanTtftMs, 0)}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "tps",
    compare: (a, b) => compareNumbers(a.metrics.meanTokensPerSec, b.metrics.meanTokensPerSec),
    renderHeaderCell: () => "Tokens/s",
    renderCell: (run) => (
      <TableCellLayout>{fixed(run.metrics.meanTokensPerSec, 1)}</TableCellLayout>
    ),
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "keywords",
    compare: (a, b) => a.metrics.keywordPassed - b.metrics.keywordPassed,
    renderHeaderCell: () => "Keywords",
    renderCell: (run) => <TableCellLayout>{keywords(run)}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "memory",
    compare: (a, b) =>
      compareNumbers(a.metrics.peakModelMemoryBytes, b.metrics.peakModelMemoryBytes),
    renderHeaderCell: () => "Peak model RAM",
    renderCell: (run) => (
      <TableCellLayout>{gigabytes(run.metrics.peakModelMemoryBytes)}</TableCellLayout>
    ),
  }),
];

/**
 * Runs as a table: sort by any column, select rows with the checkboxes, filter by compute, suite
 * and model, and export the selected rows (or every filtered row) as CSV. The selection and the
 * filters live in the benchmark UI store, so they survive moving to another tab.
 */
export default function BenchmarkRuns() {
  const { runs, error } = useBenchmarkRuns();
  const navigate = useNavigate();
  const selectedIds = useBenchmarkUiStore((s) => s.selectedRunIds);
  const setSelectedRunIds = useBenchmarkUiStore((s) => s.setSelectedRunIds);
  const compute = useBenchmarkUiStore((s) => s.runsCompute);
  const setCompute = useBenchmarkUiStore((s) => s.setRunsCompute);
  const suite = useBenchmarkUiStore((s) => s.runsSuite);
  const setSuite = useBenchmarkUiStore((s) => s.setRunsSuite);
  const model = useBenchmarkUiStore((s) => s.runsModel);
  const setModel = useBenchmarkUiStore((s) => s.setRunsModel);
  const [exporting, setExporting] = useState(false);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const suites = useMemo(() => [...new Set((runs ?? []).map((r) => r.suiteName))].sort(), [runs]);
  const models = useMemo(() => [...new Set((runs ?? []).map((r) => r.modelName))].sort(), [runs]);

  const filtered = useMemo(
    () =>
      (runs ?? []).filter(
        (r) =>
          (compute === ALL || r.compute === compute) &&
          (suite === ALL || r.suiteName === suite) &&
          (model === ALL || r.modelName === model),
      ),
    [runs, compute, suite, model],
  );

  const chosen = filtered.filter((r) => selected.has(r.id));
  const exportRows = chosen.length > 0 ? chosen : filtered;

  const handleExport = async () => {
    setExporting(true);
    try {
      const path = await saveBenchmarkExport(
        runsCsv(exportRows),
        `benchmark-runs-${fileStamp(new Date())}.csv`,
      );
      if (path) {
        toast.success("Runs exported", <ExportToastBody path={path} />);
      }
    } catch (e) {
      toast.error("Could not export the runs", errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <SurfaceCard
      title="Runs"
      action={
        <div className="benchmark-runs__actions">
          <Button
            appearance="secondary"
            icon={<DataBarVerticalRegular />}
            disabled={selectedIds.length === 0}
            onClick={() => navigate("/benchmarks/compare")}
          >
            Compare {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
          </Button>
          <Button
            appearance="secondary"
            icon={<ArrowDownloadRegular />}
            disabled={exportRows.length === 0 || exporting}
            onClick={() => void handleExport()}
          >
            {chosen.length > 0 ? `Export ${chosen.length} selected` : "Export CSV"}
          </Button>
        </div>
      }
    >
      {error && <ErrorBanner message={error} />}
      {!error && runs === null && <Spinner size="tiny" label="Loading runs" />}
      {runs !== null && runs.length === 0 && (
        <StateBlock message="No runs yet. Start a suite from the Run tab." />
      )}

      {runs !== null && runs.length > 0 && (
        <div className="benchmark-runs">
          <div className="benchmark-runs__filters">
            <ChipRow<"all" | ComputeTarget>
              ariaLabel="Compute"
              options={[
                [ALL, "All"],
                ["npu", "NPU"],
                ["gpu", "GPU"],
                ["cpu", "CPU"],
              ]}
              value={compute}
              onChange={setCompute}
            />
            <Field label="Suite">
              <Dropdown
                aria-label="Filter by suite"
                value={suite === ALL ? "All suites" : suite}
                selectedOptions={[suite]}
                onOptionSelect={(_, d) => setSuite(d.optionValue ?? ALL)}
              >
                <Option value={ALL} text="All suites">
                  All suites
                </Option>
                {suites.map((name) => (
                  <Option key={name} value={name} text={name}>
                    {name}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="Model">
              <Dropdown
                aria-label="Filter by model"
                value={model === ALL ? "All models" : model}
                selectedOptions={[model]}
                onOptionSelect={(_, d) => setModel(d.optionValue ?? ALL)}
              >
                <Option value={ALL} text="All models">
                  All models
                </Option>
                {models.map((name) => (
                  <Option key={name} value={name} text={name}>
                    {name}
                  </Option>
                ))}
              </Dropdown>
            </Field>
          </div>

          <Meta>
            {filtered.length} of {runs.length} runs
            {chosen.length > 0 ? ` · ${chosen.length} selected` : ""}
          </Meta>

          <DataGrid
            items={filtered}
            columns={COLUMNS}
            sortable
            getRowId={(run) => run.id}
            selectionMode="multiselect"
            selectedItems={selected}
            onSelectionChange={(_, data) =>
              setSelectedRunIds([...(data.selectedItems as Set<string>)])
            }
            focusMode="composite"
            className="benchmark-runs__grid"
          >
            <DataGridHeader>
              <DataGridRow
                selectionCell={{ checkboxIndicator: { "aria-label": "Select all runs" } }}
              >
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<BenchmarkRunSummary>>
              {({ item, rowId }) => (
                <DataGridRow<BenchmarkRunSummary>
                  key={rowId}
                  selectionCell={{ checkboxIndicator: { "aria-label": "Select run" } }}
                >
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        </div>
      )}
    </SurfaceCard>
  );
}

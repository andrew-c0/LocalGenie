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
  type TableColumnId,
  type TableRowId,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, DataBarVerticalRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExportToastBody } from "../../../components/benchmark/ExportToastBody/ExportToastBody";
import { ChipRow } from "../../../components/ui/ChipRow/ChipRow";
import { ErrorBanner } from "../../../components/ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../components/ui/Flex/Flex";
import { PageHeader } from "../../../components/ui/PageHeader/PageHeader";
import { Pager } from "../../../components/ui/Pager/Pager";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { SurfaceCard } from "../../../components/ui/SurfaceCard/SurfaceCard";
import { Meta } from "../../../components/ui/Typography/Typography";
import { routeById } from "../../../navigation/routeUtils";
import { saveBenchmarkExport } from "../../../services/benchmark";
import { useBenchmarkUiStore } from "../../../stores/benchmarkUiStore";
import type { BenchmarkRunSummary, ComputeTarget } from "../../../types";
import {
  isRunSortColumn,
  RUN_COMPARERS,
  type RunSort,
  type RunSortDirection,
  sortRuns,
} from "../../../utils/benchmarkRunSort";
import { runsCsv } from "../../../utils/benchmarkRunsCsv";
import { errorMessage } from "../../../utils/errorMessage";
import { fileStamp } from "../../../utils/fileStamp";
import { clampPage, pageOf } from "../../../utils/pagination";
import { toast } from "../../../utils/toast";
import { useBenchmarkRuns } from "./useBenchmarkRuns";
import "./BenchmarkRuns.css";

const ALL = "all";
const PAGE_SIZE = 10;

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

const COLUMNS: TableColumnDefinition<BenchmarkRunSummary>[] = [
  createTableColumn<BenchmarkRunSummary>({
    columnId: "started",
    compare: RUN_COMPARERS.started,
    renderHeaderCell: () => "Started",
    renderCell: (run) => <TableCellLayout>{when(run.startedAt)}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "suite",
    compare: RUN_COMPARERS.suite,
    renderHeaderCell: () => "Suite",
    renderCell: (run) => <TableCellLayout>{run.suiteName}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "model",
    compare: RUN_COMPARERS.model,
    renderHeaderCell: () => "Model",
    renderCell: (run) => <TableCellLayout>{run.modelName}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "compute",
    compare: RUN_COMPARERS.compute,
    renderHeaderCell: () => "Compute",
    renderCell: (run) => <TableCellLayout>{run.compute.toUpperCase()}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "status",
    compare: RUN_COMPARERS.status,
    renderHeaderCell: () => "Status",
    renderCell: (run) => <TableCellLayout>{run.status}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "ttft",
    compare: RUN_COMPARERS.ttft,
    renderHeaderCell: () => "TTFT (ms)",
    renderCell: (run) => <TableCellLayout>{fixed(run.metrics.meanTtftMs, 0)}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "tps",
    compare: RUN_COMPARERS.tps,
    renderHeaderCell: () => "Tokens/s",
    renderCell: (run) => (
      <TableCellLayout>{fixed(run.metrics.meanTokensPerSec, 1)}</TableCellLayout>
    ),
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "keywords",
    compare: RUN_COMPARERS.keywords,
    renderHeaderCell: () => "Keywords",
    renderCell: (run) => <TableCellLayout>{keywords(run)}</TableCellLayout>,
  }),
  createTableColumn<BenchmarkRunSummary>({
    columnId: "memory",
    compare: RUN_COMPARERS.memory,
    renderHeaderCell: () => "Peak model RAM",
    renderCell: (run) => (
      <TableCellLayout>{gigabytes(run.metrics.peakModelMemoryBytes)}</TableCellLayout>
    ),
  }),
];

/** A column whose button opens the run's details page. */
function detailsColumn(
  onOpen: (run: BenchmarkRunSummary) => void,
): TableColumnDefinition<BenchmarkRunSummary> {
  return createTableColumn<BenchmarkRunSummary>({
    columnId: "details",
    renderHeaderCell: () => "Details",
    renderCell: (run) => (
      <TableCellLayout>
        <Button appearance="subtle" size="small" onClick={() => onOpen(run)}>
          Details
        </Button>
      </TableCellLayout>
    ),
  });
}

/**
 * Runs as a table: sort by any column, select rows with the checkboxes, filter by compute, suite
 * and model, and export the selected rows (or every filtered row) as CSV. The selection and the
 * filters live in the benchmark UI store, so they survive moving to another tab.
 *
 * The table sorts and filters the whole set, then shows 10 rows a page. Select all ticks every
 * filtered run, not only the rows on the page. A sort change goes back to page 1.
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
  const [sort, setSort] = useState<RunSort | null>(null);
  const [page, setPage] = useState(1);
  const columns = useMemo(
    () => [
      ...COLUMNS,
      detailsColumn((run) => navigate(`/benchmarks/runs/${encodeURIComponent(run.id)}`)),
    ],
    [navigate],
  );

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

  const sorted = useMemo(() => sortRuns(filtered, sort), [filtered, sort]);
  const current = clampPage(page, sorted.length, PAGE_SIZE);
  const pageRowIds = useMemo(
    () => new Set<TableRowId>(pageOf(sorted, current, PAGE_SIZE).map((r) => r.id)),
    [sorted, current],
  );

  const chosen = filtered.filter((r) => selected.has(r.id));
  const exportRows = chosen.length > 0 ? chosen : filtered;

  const changeSort = (columnId: TableColumnId | undefined, direction: RunSortDirection) => {
    const sortable = typeof columnId === "string" && isRunSortColumn(columnId);
    setSort(sortable ? { columnId, direction } : null);
    setPage(1);
  };

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

  const route = routeById("benchmarks-runs");

  return (
    <Flex direction="column" gap="m">
      <PageHeader
        title={route?.title}
        subtitle={route?.description}
        actions={
          <>
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
          </>
        }
      />
      <SurfaceCard>
        {error && <ErrorBanner message={error} />}
        {!error && runs === null && <Spinner size="tiny" label="Loading runs" />}
        {runs !== null && runs.length === 0 && (
          <StateBlock message="No runs yet. Start a suite from the Run page." />
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
              items={sorted}
              columns={columns}
              sortable
              sortState={{
                sortColumn: sort?.columnId,
                sortDirection: sort?.direction ?? "ascending",
              }}
              onSortChange={(_event, data) => changeSort(data.sortColumn, data.sortDirection)}
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
              {/* Every run is in the grid so select all covers them all; only this page is drawn. */}
              <DataGridBody<BenchmarkRunSummary>>
                {({ item, rowId }) =>
                  pageRowIds.has(rowId) ? (
                    <DataGridRow<BenchmarkRunSummary>
                      key={rowId}
                      selectionCell={{ checkboxIndicator: { "aria-label": "Select run" } }}
                    >
                      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                    </DataGridRow>
                  ) : null
                }
              </DataGridBody>
            </DataGrid>

            <Pager
              page={current}
              total={sorted.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              ariaLabel="Run pages"
            />
          </div>
        )}
      </SurfaceCard>
    </Flex>
  );
}

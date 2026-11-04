import { Button, Spinner } from "@fluentui/react-components";
import { useParams } from "react-router-dom";
import { RunResponses } from "../../../components/benchmark/RunResponses/RunResponses";
import { ErrorBanner } from "../../../components/ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../components/ui/Flex/Flex";
import { PageHeader } from "../../../components/ui/PageHeader/PageHeader";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { routeById } from "../../../navigation/routeUtils";
import { useBreadcrumbLabel } from "../../../navigation/useBreadcrumbLabel";
import type { BenchmarkRunSummary } from "../../../types";
import { useBenchmarkRuns } from "../BenchmarkRuns/useBenchmarkRuns";

/** The facts under the title: model, compute target, start time and outcome. */
function factsOf(run: BenchmarkRunSummary): string {
  return [
    run.modelName,
    run.compute.toUpperCase(),
    new Date(run.startedAt).toLocaleString(),
    run.status,
  ].join(" · ");
}

/**
 * One finished run at `/benchmarks/runs/:runId`: the suite as its title, the run's facts, then its passes
 * and replies. Read-only. The breadcrumb carries the suite's name once the runs load.
 */
export default function BenchmarkRunDetail() {
  const { runId } = useParams();
  const { runs, error, reload } = useBenchmarkRuns();
  const run = runs?.find((r) => r.id === runId) ?? null;
  const missing = runs !== null && run === null;
  useBreadcrumbLabel(run?.suiteName ?? null);

  return (
    <Flex direction="column" gap="m">
      <PageHeader
        title={run?.suiteName ?? routeById("benchmarks-runs-item")?.title}
        subtitle={run ? factsOf(run) : undefined}
      />

      {error && (
        <>
          <ErrorBanner message={error} />
          <Button appearance="secondary" onClick={() => void reload()}>
            Try again
          </Button>
        </>
      )}
      {!error && runs === null && <Spinner size="tiny" label="Loading run" />}
      {missing && <StateBlock message="This run is not in the list. It may have been deleted." />}
      {run && <RunResponses runId={run.id} />}
    </Flex>
  );
}

import { Button, Spinner } from "@fluentui/react-components";
import { useParams } from "react-router-dom";
import { SuiteRun } from "../../../components/benchmark/SuiteRun/SuiteRun";
import { ErrorBanner } from "../../../components/ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../components/ui/Flex/Flex";
import { PageHeader } from "../../../components/ui/PageHeader/PageHeader";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { routeById } from "../../../navigation/routeUtils";
import { useBreadcrumbLabel } from "../../../navigation/useBreadcrumbLabel";
import { useBenchmarkSuites } from "../BenchmarkSuites/useBenchmarkSuites";

/**
 * One suite's run page at `/benchmarks/run/:suiteId`: the suite's name as the title, then its run panel.
 * A run keeps going when the user leaves this page. The breadcrumb carries the suite's name once it loads.
 */
export default function BenchmarkRunItem() {
  const { suiteId } = useParams();
  const { suites, error, reload } = useBenchmarkSuites();
  const suite = suites?.find((s) => s.id === suiteId) ?? null;
  const loading = suites === null && error === null;
  const missing = suites !== null && suite === null;
  useBreadcrumbLabel(suite?.name ?? null);

  return (
    <Flex direction="column" gap="m">
      <PageHeader title={suite?.name ?? routeById("benchmarks-run-item")?.title} />

      {error && (
        <>
          <ErrorBanner message={error} />
          <Button appearance="secondary" onClick={() => void reload()}>
            Try again
          </Button>
        </>
      )}
      {loading && <Spinner size="tiny" label="Loading suite" />}
      {missing && <StateBlock message="This suite is not in the list. It may have been deleted." />}
      {suite && <SuiteRun key={suite.id} suiteId={suite.id} />}
    </Flex>
  );
}

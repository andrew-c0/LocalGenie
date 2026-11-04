import { useNavigate } from "react-router-dom";
import { BenchmarkList } from "../../../components/benchmark/BenchmarkList/BenchmarkList";
import { Flex } from "../../../components/ui/Flex/Flex";
import { PageHeader } from "../../../components/ui/PageHeader/PageHeader";
import { routeById } from "../../../navigation/routeUtils";
import type { BenchmarkSuite } from "../../../types";
import { suiteDetail } from "../../../utils/benchmarkDetails";
import { useBenchmarkSuites } from "../BenchmarkSuites/useBenchmarkSuites";

/**
 * Run: the saved suites as full-width rows. A row opens the suite's run page (`/benchmarks/run/:suiteId`),
 * where it runs on the loaded model. The run counter on each suite is read again each time this list opens.
 */
export default function BenchmarkRun() {
  const navigate = useNavigate();
  const { suites, error, reload } = useBenchmarkSuites();
  const route = routeById("benchmarks-run");

  const openRun = (suite: BenchmarkSuite) =>
    navigate(`/benchmarks/run/${encodeURIComponent(suite.id)}`);

  return (
    <Flex direction="column" gap="m">
      <PageHeader title={route?.title} subtitle={route?.description} />
      <BenchmarkList
        items={suites}
        error={error}
        emptyMessage="No suites yet. Create one in Test Runs first."
        detailOf={suiteDetail}
        onOpen={openRun}
        onRetry={() => void reload()}
      />
    </Flex>
  );
}

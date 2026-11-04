import { Button } from "@fluentui/react-components";
import { AddRegular, DeleteRegular, EditRegular, PlayRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BenchmarkList } from "../../../components/benchmark/BenchmarkList/BenchmarkList";
import { DeleteBenchmarkDialog } from "../../../components/benchmark/DeleteBenchmarkDialog/DeleteBenchmarkDialog";
import { Flex } from "../../../components/ui/Flex/Flex";
import { PageHeader } from "../../../components/ui/PageHeader/PageHeader";
import { routeById } from "../../../navigation/routeUtils";
import type { BenchmarkSuite } from "../../../types";
import { suiteDetail } from "../../../utils/benchmarkDetails";
import { useBenchmarkSuites } from "./useBenchmarkSuites";

/**
 * Test Runs: the saved suites as full-width rows. A row opens the suite (`/benchmarks/suites/:suiteId`);
 * its menu edits it, starts a run on its run page, or deletes it. New suite opens an empty one. The model
 * and compute target are chosen when a run starts.
 */
export default function BenchmarkSuites() {
  const navigate = useNavigate();
  const { suites, error, reload, remove } = useBenchmarkSuites();
  const [deleting, setDeleting] = useState<BenchmarkSuite | null>(null);
  const route = routeById("benchmarks-suites");

  const openSuite = (suite: BenchmarkSuite) =>
    navigate(`/benchmarks/suites/${encodeURIComponent(suite.id)}`);

  return (
    <Flex direction="column" gap="m">
      <PageHeader
        title={route?.title}
        subtitle={route?.description}
        actions={
          <Button
            appearance="primary"
            icon={<AddRegular />}
            onClick={() => navigate("/benchmarks/suites/new")}
          >
            New suite
          </Button>
        }
      />
      <BenchmarkList
        items={suites}
        error={error}
        emptyMessage="No suites yet. Create one to describe a test run."
        detailOf={suiteDetail}
        onOpen={openSuite}
        actionsOf={(suite) => [
          { label: "Edit", icon: <EditRegular />, onClick: () => openSuite(suite) },
          {
            label: "Run",
            icon: <PlayRegular />,
            onClick: () => navigate(`/benchmarks/run/${encodeURIComponent(suite.id)}`),
          },
          {
            label: "Delete",
            icon: <DeleteRegular />,
            danger: true,
            onClick: () => setDeleting(suite),
          },
        ]}
        onRetry={() => void reload()}
      />

      {deleting && (
        <DeleteBenchmarkDialog
          kind="suite"
          name={deleting.name}
          onConfirm={() => {
            void remove(deleting);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Flex>
  );
}

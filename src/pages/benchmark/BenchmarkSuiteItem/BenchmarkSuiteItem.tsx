import { Button, Spinner } from "@fluentui/react-components";
import { useNavigate, useParams } from "react-router-dom";
import { SuiteEditor } from "../../../components/benchmark/SuiteEditor/SuiteEditor";
import { ErrorBanner } from "../../../components/ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../components/ui/Flex/Flex";
import { PageHeader } from "../../../components/ui/PageHeader/PageHeader";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { routeById } from "../../../navigation/routeUtils";
import { useBreadcrumbLabel } from "../../../navigation/useBreadcrumbLabel";
import type { BenchmarkSuite } from "../../../types";
import { useBenchmarkPrompts } from "../BenchmarkPrompts/useBenchmarkPrompts";
import { useBenchmarkSuites } from "../BenchmarkSuites/useBenchmarkSuites";

const LIST_PATH = "/benchmarks/suites";

/**
 * One suite's page: its editor under the title. `/benchmarks/suites/:suiteId` edits a saved suite;
 * `/benchmarks/suites/new` has no id and starts an empty one. The breadcrumb carries the suite's name
 * once it loads. A new suite, once saved, replaces its page with its own URL. Deleting is done from
 * the list.
 */
export default function BenchmarkSuiteItem() {
  const { suiteId } = useParams();
  const navigate = useNavigate();
  const { suites, error, reload, upsert } = useBenchmarkSuites();
  const promptLibrary = useBenchmarkPrompts();

  const isNew = suiteId === undefined;
  const suite = isNew ? null : (suites?.find((s) => s.id === suiteId) ?? null);
  const loading = !isNew && suites === null && error === null;
  const missing = !isNew && suites !== null && suite === null;
  useBreadcrumbLabel(suite?.name ?? null);

  const itemTitle = routeById("benchmarks-suites-item")?.title;
  const newTitle = routeById("benchmarks-suites-new")?.title;

  const handleSaved = (saved: BenchmarkSuite) => {
    upsert(saved);
    if (isNew) {
      navigate(`${LIST_PATH}/${encodeURIComponent(saved.id)}`, { replace: true });
    }
  };

  return (
    <Flex direction="column" gap="m">
      <PageHeader title={suite?.name ?? (isNew ? newTitle : itemTitle)} />

      {error && (
        <>
          <ErrorBanner message={error} />
          <Button appearance="secondary" onClick={() => void reload()}>
            Try again
          </Button>
        </>
      )}
      {promptLibrary.error && <ErrorBanner message={promptLibrary.error} />}
      {loading && <Spinner size="tiny" label="Loading suite" />}
      {missing && <StateBlock message="This suite is not in the list. It may have been deleted." />}

      {/* Keyed by the suite, so a new suite's editor starts clean once it has an id. */}
      {(isNew || suite) && (
        <SuiteEditor
          key={suiteId ?? "new"}
          initial={suite}
          prompts={promptLibrary.prompts ?? []}
          onSaved={handleSaved}
        />
      )}
    </Flex>
  );
}

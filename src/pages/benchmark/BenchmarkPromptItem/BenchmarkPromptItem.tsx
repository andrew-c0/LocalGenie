import { Button, Spinner } from "@fluentui/react-components";
import { useNavigate, useParams } from "react-router-dom";
import { PromptEditor } from "../../../components/benchmark/PromptEditor/PromptEditor";
import { ErrorBanner } from "../../../components/ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../components/ui/Flex/Flex";
import { PageHeader } from "../../../components/ui/PageHeader/PageHeader";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { routeById } from "../../../navigation/routeUtils";
import { useBreadcrumbLabel } from "../../../navigation/useBreadcrumbLabel";
import type { BenchmarkPrompt } from "../../../types";
import { useBenchmarkPrompts } from "../BenchmarkPrompts/useBenchmarkPrompts";

const LIST_PATH = "/benchmarks/prompts";

/**
 * One prompt's page: its editor under the title. `/benchmarks/prompts/:promptId` edits a saved prompt;
 * `/benchmarks/prompts/new` has no id and starts an empty one. The breadcrumb carries the prompt's name
 * once it loads. A new prompt, once saved, replaces its page with its own URL. Deleting is done from
 * the list.
 */
export default function BenchmarkPromptItem() {
  const { promptId } = useParams();
  const navigate = useNavigate();
  const { prompts, error, reload, upsert } = useBenchmarkPrompts();

  const isNew = promptId === undefined;
  const prompt = isNew ? null : (prompts?.find((p) => p.id === promptId) ?? null);
  const loading = !isNew && prompts === null && error === null;
  const missing = !isNew && prompts !== null && prompt === null;
  useBreadcrumbLabel(prompt?.name ?? null);

  const itemTitle = routeById("benchmarks-prompts-item")?.title;
  const newTitle = routeById("benchmarks-prompts-new")?.title;

  const handleSaved = (saved: BenchmarkPrompt) => {
    upsert(saved);
    if (isNew) {
      navigate(`${LIST_PATH}/${encodeURIComponent(saved.id)}`, { replace: true });
    }
  };

  return (
    <Flex direction="column" gap="m">
      <PageHeader title={prompt?.name ?? (isNew ? newTitle : itemTitle)} />

      {error && (
        <>
          <ErrorBanner message={error} />
          <Button appearance="secondary" onClick={() => void reload()}>
            Try again
          </Button>
        </>
      )}
      {loading && <Spinner size="tiny" label="Loading prompt" />}
      {missing && (
        <StateBlock message="This prompt is not in the library. It may have been deleted." />
      )}

      {/* Keyed by the prompt, so a new prompt's editor starts clean once it has an id. */}
      {(isNew || prompt) && (
        <PromptEditor key={promptId ?? "new"} initial={prompt} onSaved={handleSaved} />
      )}
    </Flex>
  );
}

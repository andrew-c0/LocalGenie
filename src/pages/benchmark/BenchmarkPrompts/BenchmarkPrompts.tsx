import { Button } from "@fluentui/react-components";
import { AddRegular, DeleteRegular, EditRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BenchmarkList } from "../../../components/benchmark/BenchmarkList/BenchmarkList";
import { DeleteBenchmarkDialog } from "../../../components/benchmark/DeleteBenchmarkDialog/DeleteBenchmarkDialog";
import { Flex } from "../../../components/ui/Flex/Flex";
import { PageHeader } from "../../../components/ui/PageHeader/PageHeader";
import { routeById } from "../../../navigation/routeUtils";
import type { BenchmarkPrompt } from "../../../types";
import { promptDetail } from "../../../utils/benchmarkDetails";
import { useBenchmarkPrompts } from "./useBenchmarkPrompts";

/**
 * Prompt Library: saved prompts as full-width rows with their keywords and files. A row opens the prompt
 * (`/benchmarks/prompts/:promptId`); its menu edits or deletes it. New prompt opens an empty one.
 */
export default function BenchmarkPrompts() {
  const navigate = useNavigate();
  const { prompts, error, reload, remove } = useBenchmarkPrompts();
  const [deleting, setDeleting] = useState<BenchmarkPrompt | null>(null);
  const route = routeById("benchmarks-prompts");

  const openPrompt = (prompt: BenchmarkPrompt) =>
    navigate(`/benchmarks/prompts/${encodeURIComponent(prompt.id)}`);

  return (
    <Flex direction="column" gap="m">
      <PageHeader
        title={route?.title}
        subtitle={route?.description}
        actions={
          <Button
            appearance="primary"
            icon={<AddRegular />}
            onClick={() => navigate("/benchmarks/prompts/new")}
          >
            New prompt
          </Button>
        }
      />
      <BenchmarkList
        items={prompts}
        error={error}
        emptyMessage="No prompts yet. Create one to use it in a test run."
        detailOf={promptDetail}
        onOpen={openPrompt}
        actionsOf={(prompt) => [
          { label: "Edit", icon: <EditRegular />, onClick: () => openPrompt(prompt) },
          {
            label: "Delete",
            icon: <DeleteRegular />,
            danger: true,
            onClick: () => setDeleting(prompt),
          },
        ]}
        onRetry={() => void reload()}
      />

      {deleting && (
        <DeleteBenchmarkDialog
          kind="prompt"
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

import { useMemo } from "react";
import { formatBytes } from "../../utils/format";
import {
  groupPlaygroundLocalModels,
  type PlaygroundLocalModel,
} from "../../utils/playgroundLocalModels";
import { deleteModelMessage, deleteModelTitle } from "../../utils/playgroundText";
import { ConfirmDialog } from "../ui/ConfirmDialog/ConfirmDialog";
import { Flex } from "../ui/Flex/Flex";
import { StateBlock } from "../ui/StateBlock/StateBlock";
import { SectionTitle } from "../ui/Typography/Typography";
import { PlaygroundLocalRow } from "./PlaygroundLocalRow";
import { usePlaygroundLocalDelete } from "./usePlaygroundLocalDelete";

/** The delete dialog's body. The size is left out when the catalog does not list one. */
function deleteBody(model: PlaygroundLocalModel): string {
  return model.sizeBytes === undefined
    ? "You can download it again later. Files shared with other downloaded models are kept."
    : deleteModelMessage(formatBytes(model.sizeBytes));
}

interface PlaygroundLocalModelsProps {
  /** Every installed Playground model. */
  models: PlaygroundLocalModel[];
  /** The name filter from the page's search box. */
  query: string;
}

/**
 * The installed Playground models on the Local models page, under a heading per tool. Delete asks for
 * confirmation first and then removes the model's files through its tool's delete.
 */
export function PlaygroundLocalModels({ models, query }: PlaygroundLocalModelsProps) {
  const groups = useMemo(() => groupPlaygroundLocalModels(models, query), [models, query]);
  const { pendingModel, deletingModelId, requestDelete, cancelDelete, confirmDelete } =
    usePlaygroundLocalDelete(models);

  if (groups.length === 0) {
    return <StateBlock icon="🔍" message={`No Playground models match "${query.trim()}".`} />;
  }

  return (
    <Flex direction="column" gap="l">
      {groups.map((view) => (
        <section key={view.group} aria-label={view.label}>
          <Flex direction="column" gap="s">
            <SectionTitle as="h3">{view.label}</SectionTitle>
            {view.models.map((model) => (
              <PlaygroundLocalRow
                key={model.id}
                model={model}
                isDeleteBusy={deletingModelId === model.id}
                onDelete={requestDelete}
              />
            ))}
          </Flex>
        </section>
      ))}

      {pendingModel && (
        <ConfirmDialog
          title={deleteModelTitle(pendingModel.label)}
          message={deleteBody(pendingModel)}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </Flex>
  );
}

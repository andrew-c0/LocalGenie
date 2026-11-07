import { Button } from "@fluentui/react-components";
import { useNavigate } from "react-router-dom";
import { useRuntimeLocks } from "../../../hooks/useRuntimeLocks";
import { type CatalogSection, runtimeNeedOf } from "../../../utils/playgroundModelsCatalog";
import { Flex } from "../../ui/Flex/Flex";
import { Meta, SectionTitle } from "../../ui/Typography/Typography";
import { PlaygroundCatalogRow } from "./PlaygroundCatalogRow/PlaygroundCatalogRow";

interface PlaygroundCatalogSectionProps {
  section: CatalogSection;
  /** Another Playground download is running. Downloads run one at a time. */
  isAnyDownloading: boolean;
  /** The installed model whose delete is running, or null. */
  deletingModelId: string | null;
  onDelete: (modelId: string) => void;
}

/**
 * One tool's heading and its models. When the tool's runtime is missing, a line says so with a button
 * to Settings > Runtimes. The models can still be downloaded; only running them needs the runtime.
 */
export function PlaygroundCatalogSection({
  section,
  isAnyDownloading,
  deletingModelId,
  onDelete,
}: PlaygroundCatalogSectionProps) {
  const navigate = useNavigate();
  const lockedReason = useRuntimeLocks()(runtimeNeedOf(section.group));

  return (
    <section aria-label={section.label}>
      <Flex direction="column" gap="s">
        <SectionTitle as="h3">{section.label}</SectionTitle>
        {lockedReason && (
          <Flex align="center" gap="s" wrap>
            <Meta>{lockedReason}</Meta>
            <Button
              appearance="secondary"
              size="small"
              onClick={() => navigate("/settings/runtimes")}
            >
              Open Runtimes
            </Button>
          </Flex>
        )}
        {section.rows.map((row) => (
          <PlaygroundCatalogRow
            key={row.id}
            row={row}
            isDeleteBusy={deletingModelId === row.id}
            isAnyDownloading={isAnyDownloading}
            onDelete={onDelete}
          />
        ))}
      </Flex>
    </section>
  );
}

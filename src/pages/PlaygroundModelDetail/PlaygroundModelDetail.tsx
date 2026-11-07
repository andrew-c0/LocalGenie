import { Button, Card } from "@fluentui/react-components";
import { ArrowDownloadRegular, DeleteRegular, OpenRegular } from "@fluentui/react-icons";
import { useNavigate, useParams } from "react-router-dom";
import { CapabilitiesSection } from "../../components/models/CapabilitiesSection";
import { ModelDetailLayout } from "../../components/models/ModelDetailLayout";
import { type ModelFact, ModelFacts } from "../../components/models/ModelFacts";
import type { ModelFileRow } from "../../components/models/ModelFilesCard/ModelFileLine";
import { ModelFilesCard } from "../../components/models/ModelFilesCard/ModelFilesCard";
import { ModelSpecSection } from "../../components/models/ModelSpecSection/ModelSpecSection";
import { downloadCatalogModel } from "../../components/playground/playgroundSelection";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog/ConfirmDialog";
import { ExternalLink } from "../../components/ui/ExternalLink/ExternalLink";
import { useBreadcrumbLabel } from "../../navigation/useBreadcrumbLabel";
import { downloadButtonLabelOf } from "../../utils/modelRecommendations";
import type { SpecCell } from "../../utils/modelSpecs";
import { deleteBodyOf } from "../../utils/playgroundLocalModels";
import {
  groupOfParam,
  type PlaygroundModelFile,
  playgroundModelDetailOf,
} from "../../utils/playgroundModelDetail";
import { deleteModelTitle } from "../../utils/playgroundText";
import { PlaygroundModelReadme } from "./PlaygroundModelReadme";
import { PlaygroundModelUnavailable } from "./PlaygroundModelUnavailable";
import { usePlaygroundModelDetail } from "./usePlaygroundModelDetail";

/** A fact of the facts card. A cell with a link shows its value as that link. */
function factOf(cell: SpecCell): ModelFact {
  const value =
    cell.href && cell.value ? (
      <ExternalLink url={cell.href}>{cell.value}</ExternalLink>
    ) : (
      cell.value
    );
  return { label: cell.label, value };
}

/** The Files card's rows: each file's name and size, and the repo or page it comes from. */
function fileRowsOf(files: PlaygroundModelFile[]): ModelFileRow[] {
  return files.map((file) => ({
    key: file.name,
    name: file.name,
    sizeLabel: file.sizeLabel,
    source: { label: file.sourceLabel, url: file.sourceUrl },
  }));
}

/**
 * One curated Playground model (`/models/playground/:group/:modelId`), in the same order as the Hugging Face
 * page: the facts, the capabilities, the specifications, the files, then the model card. Its download,
 * delete and open-in-tool actions sit in the header.
 */
export default function PlaygroundModelDetail() {
  const { group = "", modelId = "" } = useParams<{ group: string; modelId: string }>();
  const navigate = useNavigate();
  const detailState = usePlaygroundModelDetail(groupOfParam(group), modelId);
  const { entry, download, installed, deletion } = detailState;
  useBreadcrumbLabel(entry?.model.name ?? null);

  if (!entry)
    return (
      <PlaygroundModelUnavailable status={detailState.status} failures={detailState.failures} />
    );

  const isDownloading = download?.status === "downloading";
  const detail = playgroundModelDetailOf(entry, {
    installed: installed !== null,
    downloading: isDownloading,
  });

  const openInTool = () => {
    const path = detailState.openTool();
    if (path) navigate(path);
  };

  return (
    <ModelDetailLayout
      title={detail.name}
      subtitle={detail.description || undefined}
      actions={
        <div className="model-detail__actions">
          {installed ? (
            <>
              <Button
                appearance="secondary"
                icon={<DeleteRegular />}
                disabled={deletion.deletingModelId === installed.id}
                onClick={() => deletion.requestDelete(installed)}
              >
                Delete
              </Button>
              {detailState.toolTitle && (
                <Button appearance="primary" icon={<OpenRegular />} onClick={openInTool}>
                  Open in {detailState.toolTitle}
                </Button>
              )}
            </>
          ) : (
            <Button
              appearance="secondary"
              icon={<ArrowDownloadRegular />}
              disabled={isDownloading || detailState.isAnyDownloading}
              onClick={() => downloadCatalogModel(entry.kind, entry.model)}
            >
              {downloadButtonLabelOf(download)}
            </Button>
          )}
        </div>
      }
    >
      <Card size="small">
        <ModelFacts facts={detail.facts.map(factOf)} />
      </Card>
      <CapabilitiesSection badges={detail.capabilities} />
      <ModelSpecSection title="Specifications" cells={detail.specs} />
      <ModelFilesCard rows={fileRowsOf(detail.files)} />
      <PlaygroundModelReadme cardRepo={detail.cardRepo} sourceUrl={detail.sourceUrl} />

      {deletion.pendingModel && (
        <ConfirmDialog
          title={deleteModelTitle(deletion.pendingModel.label)}
          message={deleteBodyOf(deletion.pendingModel)}
          confirmLabel="Delete"
          onConfirm={deletion.confirmDelete}
          onCancel={deletion.cancelDelete}
        />
      )}
    </ModelDetailLayout>
  );
}

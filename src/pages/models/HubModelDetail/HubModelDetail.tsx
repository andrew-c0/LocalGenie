import { Button, Card } from "@fluentui/react-components";
import { ChatRegular, DeleteRegular, OpenRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CapabilitiesSection } from "../../../components/models/CapabilitiesSection";
import { GGUFVariantList } from "../../../components/models/GGUFVariantList";
import { ModelCardPanel, ModelDetailLayout } from "../../../components/models/ModelDetailLayout";
import { ModelFacetRow } from "../../../components/models/ModelFacetRow";
import { ModelFilesCard } from "../../../components/models/ModelFilesCard/ModelFilesCard";
import { ModelSpecSection } from "../../../components/models/ModelSpecSection/ModelSpecSection";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog";
import { Flex } from "../../../components/ui/Flex/Flex";
import { MarkdownContent } from "../../../components/ui/MarkdownContent/MarkdownContent";
import { RetryBlock } from "../../../components/ui/RetryBlock/RetryBlock";
import { SkeletonBlock } from "../../../components/ui/Skeletons/SkeletonBlock";
import { SkeletonLines } from "../../../components/ui/Skeletons/SkeletonLines";
import { SkeletonRows } from "../../../components/ui/Skeletons/SkeletonRows";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { StatusBadge } from "../../../components/ui/StatusBadge/StatusBadge";
import { Meta } from "../../../components/ui/Typography/Typography";
import type { AsyncData } from "../../../hooks/useAsyncData";
import { useModelCapabilityBadges } from "../../../hooks/useModelCapabilityBadges";
import { useSystemMemory } from "../../../hooks/useSystemMemory";
import * as db from "../../../services/database";
import * as geniex from "../../../services/geniex";
import {
  estimateModelBytes,
  hubModelPageUrl,
  precisionInfo,
  ramFitForBytes,
} from "../../../services/hubApi";
import type { GGUFGroup } from "../../../services/hubModels";
import { openExternal } from "../../../services/system";
import { isDownloadActive, useDownloadStore } from "../../../stores/downloadStore";
import { useModelStore } from "../../../stores/modelStore";
import { cardRamVerdict } from "../../../utils/cardRam";
import { errorMessage } from "../../../utils/errorMessage";
import { formatBytes } from "../../../utils/format";
import { inferredCapabilities, inferredCapabilityBadges } from "../../../utils/hubCapabilities";
import { facetSummaryFromModel, parseFacets } from "../../../utils/hubModelInfo";
import { fitCell, hubSpecCells, installedSpecCells } from "../../../utils/modelSpecs";
import { useDownloadedPrecisions, useHubModelData, useStoredModelRow } from "../useHubModelDetail";

/** The README panel's body: the installed model's stored card, or the Hub README with its own loading and retry. */
function readmeBody(
  repoId: string,
  isLocal: boolean,
  localCard: string | null,
  readme: AsyncData<string | null>,
): ReactNode {
  if (isLocal) {
    return localCard ? (
      <MarkdownContent allowHtml repoId={repoId}>
        {localCard}
      </MarkdownContent>
    ) : undefined;
  }
  if (readme.status === "loading") return <SkeletonLines lines={6} />;
  if (readme.status === "error") {
    return (
      <RetryBlock compact error={readme.error} subject="Hugging Face" onRetry={readme.retry} />
    );
  }
  // A repo with no README (404) is ready with no content: the panel says there is no card.
  return readme.data ? (
    <MarkdownContent allowHtml repoId={repoId}>
      {readme.data}
    </MarkdownContent>
  ) : undefined;
}

interface Props {
  /** Viewing a locally installed model (DB-backed). The route decides: `/models/local/:repoId` is true. */
  isLocal: boolean;
}

export default function HubModelDetail({ isLocal }: Props) {
  const { repoId = "" } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const { model, localCard, status, error, retry, files, readme, ggufGroups } = useHubModelData(
    repoId,
    isLocal,
  );
  const downloadedPrecisions = useDownloadedPrecisions(repoId);
  const storedRow = useStoredModelRow(repoId, isLocal);
  // Confirmed capabilities come from the stored scan, which only an installed model has.
  const confirmedBadges = useModelCapabilityBadges(isLocal ? repoId : null);
  const systemMemory = useSystemMemory();
  const isDownloading = useDownloadStore((s) =>
    s.downloads.some((d) => d.id === repoId && isDownloadActive(d.status)),
  );
  const activeFilename = useDownloadStore(
    (s) =>
      s.downloads.find((d) => d.id === repoId && isDownloadActive(d.status))?.variant?.main
        .filename ?? null,
  );
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!model) return;
    try {
      await geniex.removeModel(model.id);
      await db.deleteDownloadedModel(repoId);
      try {
        const updated = await geniex.listModels();
        useModelStore.getState().setModels(updated);
      } catch {
        // ignore
      }
      navigate("/models/local");
    } catch (err) {
      setDeleteError(String(err));
    } finally {
      setConfirmDelete(null);
    }
  };

  if (status === "loading") {
    // An installed model is read from the local database, so the loading text names no cloud service.
    if (isLocal) {
      return (
        <ModelDetailLayout title={repoId}>
          <StateBlock icon="⏳" message={`Loading ${repoId}…`} />
        </ModelDetailLayout>
      );
    }
    return (
      <ModelDetailLayout
        title={repoId}
        subtitle="Fetching model metadata and files from Hugging Face."
      >
        <SkeletonBlock height={64} />
        <SkeletonRows count={3} variant="row" />
      </ModelDetailLayout>
    );
  }

  if (!isLocal && status === "error") {
    return (
      <ModelDetailLayout title={repoId} subtitle="This model could not be displayed.">
        <RetryBlock error={error} subject="Hugging Face" onRetry={retry} />
      </ModelDetailLayout>
    );
  }

  if (status === "error" || deleteError || !model) {
    return (
      <ModelDetailLayout title={repoId} subtitle="This model could not be displayed.">
        <StateBlock icon="⚠️" message={deleteError ?? errorMessage(error, "Model not found.")} />
      </ModelDetailLayout>
    );
  }

  const fileRows = (files.data ?? []).map((f) => ({
    key: f.path,
    name: `${f.type === "directory" ? "📁" : "📄"} ${f.path}`,
    sizeLabel: formatBytes(f.size),
  }));

  const paramsCount = model?.safetensors?.parameters ?? null;
  // GGUF files have actual size — compute RAM fit directly from file size (with overhead for KV cache/activations)
  const estimateRamFitFromFileSize = (fileSize: number) => {
    if (!fileSize || !systemMemory) return null;
    const neededBytes = Math.round(fileSize * 1.15);
    return ramFitForBytes(neededBytes, systemMemory);
  };
  const estimateMemoryRequirement = (bits: number | null) => {
    if (paramsCount == null || bits == null) return null;
    const neededBytes = estimateModelBytes(paramsCount, bits);
    if (!neededBytes || !systemMemory) return null;
    return ramFitForBytes(neededBytes, systemMemory);
  };

  // The facets are stored with the download, so the installed model page can show them later.
  const remoteFacets = facetSummaryFromModel(model);
  const storedFacets = parseFacets(storedRow?.facets);
  const facets = isLocal ? storedFacets : remoteFacets;
  const groupPrecisions = ggufGroups.map((g) => g.main.precision);

  // Capabilities: inferred from the Hub's tags and chat template, or confirmed by a scan when installed.
  const capabilityBadges = isLocal
    ? confirmedBadges
    : inferredCapabilityBadges(inferredCapabilities(model));
  const fitCells = isLocal
    ? []
    : [
        fitCell(
          cardRamVerdict(remoteFacets.paramCount, systemMemory),
          remoteFacets.paramCountApproximate,
        ),
      ];
  const specCells = isLocal
    ? installedSpecCells(storedRow, storedFacets)
    : hubSpecCells(model, remoteFacets, groupPrecisions);

  const handleDownload = (group: GGUFGroup) => {
    useDownloadStore.getState().enqueue({
      repoId,
      main: group.main,
      sidecars: group.sidecars,
      facets: remoteFacets,
    });
  };

  const busy = isDownloading;

  return (
    <ModelDetailLayout
      title={model.id}
      subtitle={model.author}
      actions={
        <div className="model-detail__actions">
          {isLocal && (
            <Button
              appearance="primary"
              icon={<ChatRegular />}
              onClick={() => setSelectorOpen(true)}
            >
              Load & Chat
            </Button>
          )}
          {isLocal && (
            <Button
              appearance="secondary"
              icon={<DeleteRegular />}
              title="Remove model"
              onClick={() => setConfirmDelete(model.id)}
            >
              Delete
            </Button>
          )}
          <Button
            appearance="secondary"
            icon={<OpenRegular />}
            onClick={() =>
              openExternal(hubModelPageUrl(model.id)).catch((err) =>
                console.error("Failed to open browser:", err),
              )
            }
          >
            Open on Hugging Face
          </Button>
        </div>
      }
    >
      {!isLocal && model.gated && (
        <Flex gap="s" align="center">
          <StatusBadge tone="blue">Gated repo</StatusBadge>
          <Meta>Access must be requested on Hugging Face.</Meta>
        </Flex>
      )}

      {facets && (
        <Card size="small">
          <ModelFacetRow
            facets={facets}
            precisions={isLocal ? [...downloadedPrecisions] : groupPrecisions}
          />
        </Card>
      )}

      <CapabilitiesSection badges={capabilityBadges} isInferred={!isLocal} cells={fitCells} />
      <ModelSpecSection title="Specifications" cells={specCells} />

      {/* The file list drives the variant list and the Files card: each shows its own loading and retry. */}
      {!isLocal && files.status === "loading" && <SkeletonRows count={3} variant="row" />}
      {!isLocal && files.status === "error" && (
        <Card size="small">
          <RetryBlock compact error={files.error} subject="Hugging Face" onRetry={files.retry} />
        </Card>
      )}

      {!isLocal && ggufGroups.length > 0 && (
        <GGUFVariantList
          groups={ggufGroups}
          downloadedPrecisions={downloadedPrecisions}
          fitFor={(group) =>
            estimateRamFitFromFileSize(group.main.size ?? 0) ??
            estimateMemoryRequirement(precisionInfo(group.main.precision).bitsPerWeight ?? 4)
          }
          activeFilename={activeFilename}
          busy={busy}
          onDownload={handleDownload}
          onLoad={() => setSelectorOpen(true)}
        />
      )}

      {!isLocal && files.status === "loading" && (
        <Card size="small">
          <SkeletonBlock height={32} />
        </Card>
      )}

      {!isLocal && <ModelFilesCard rows={fileRows} />}

      <ModelCardPanel>{readmeBody(repoId, isLocal, localCard, readme)}</ModelCardPanel>

      {confirmDelete && (
        <ConfirmDialog
          title="Remove model"
          message={
            <>
              Remove <strong>{confirmDelete}</strong> from local storage?
            </>
          }
          confirmLabel="Remove"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </ModelDetailLayout>
  );
}

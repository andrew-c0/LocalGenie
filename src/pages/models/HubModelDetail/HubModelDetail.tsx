import { Button, Card } from "@fluentui/react-components";
import {
  ChatRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  DeleteRegular,
  OpenRegular,
} from "@fluentui/react-icons";
import { open } from "@tauri-apps/plugin-shell";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CapabilitiesSection } from "../../../components/models/CapabilitiesSection";
import { GGUFVariantList } from "../../../components/models/GGUFVariantList";
import { ModelCardPanel, ModelDetailLayout } from "../../../components/models/ModelDetailLayout";
import { ModelFacetRow } from "../../../components/models/ModelFacetRow";
import { ModelSpecSection } from "../../../components/models/ModelSpecSection/ModelSpecSection";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog";
import { Flex } from "../../../components/ui/Flex/Flex";
import { MarkdownContent } from "../../../components/ui/MarkdownContent/MarkdownContent";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
import { StatusBadge } from "../../../components/ui/StatusBadge/StatusBadge";
import { Meta } from "../../../components/ui/Typography/Typography";
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
import { isDownloadActive, useDownloadStore } from "../../../stores/downloadStore";
import { useModelStore } from "../../../stores/modelStore";
import { cardRamVerdict } from "../../../utils/cardRam";
import { formatBytes } from "../../../utils/format";
import { inferredCapabilities, inferredCapabilityBadges } from "../../../utils/hubCapabilities";
import { facetSummaryFromModel, parseFacets } from "../../../utils/hubModelInfo";
import { fitCell, hubSpecCells, installedSpecCells } from "../../../utils/modelSpecs";
import { useDownloadedPrecisions, useHubModelData, useStoredModelRow } from "../useHubModelDetail";
import "./HubModelDetail.css";

interface Props {
  /** Viewing a locally installed model (DB-backed). The route decides: `/models/local/:repoId` is true. */
  isLocal: boolean;
}

export default function HubModelDetail({ isLocal }: Props) {
  const { repoId = "" } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const { model, files, readme, localCard, ggufGroups, loading, error, setError } = useHubModelData(
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
  const [filesOpen, setFilesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
      setError(String(err));
    } finally {
      setConfirmDelete(null);
    }
  };

  if (loading) {
    return (
      <ModelDetailLayout
        title={repoId}
        subtitle="Fetching model metadata and files from Hugging Face."
      >
        <StateBlock icon="⏳" message={`Loading ${repoId} from Hugging Face…`} />
      </ModelDetailLayout>
    );
  }

  if (error || !model) {
    return (
      <ModelDetailLayout title={repoId} subtitle="This model could not be displayed.">
        <StateBlock icon="⚠️" message={error ?? "Model not found."} />
      </ModelDetailLayout>
    );
  }

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
  const modelContent = isLocal ? localCard : readme;

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
              open(hubModelPageUrl(model.id)).catch((err) =>
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

      {!isLocal && files.length > 0 && (
        <Card size="small">
          <Button
            appearance="secondary"
            className="hub-model-detail__align-start"
            icon={filesOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
            aria-expanded={filesOpen}
            onClick={() => setFilesOpen((v) => !v)}
          >
            Files ({files.length})
          </Button>
          {filesOpen &&
            files.map((f) => (
              <div key={f.path} className="hub-model-detail__file-row">
                <Meta className="hub-model-detail__file-name">
                  {f.type === "directory" ? "📁" : "📄"} {f.path}
                </Meta>
                <Meta>{formatBytes(f.size)}</Meta>
              </div>
            ))}
        </Card>
      )}

      <ModelCardPanel>
        {modelContent ? <MarkdownContent allowHtml>{modelContent}</MarkdownContent> : undefined}
      </ModelCardPanel>

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

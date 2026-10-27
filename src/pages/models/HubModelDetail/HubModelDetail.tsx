import { Button, Card, CardHeader } from "@fluentui/react-components";
import {
  ArrowLeftRegular,
  ChatRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  DeleteRegular,
  OpenRegular,
} from "@fluentui/react-icons";
import { open } from "@tauri-apps/plugin-shell";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GGUFVariantList } from "../../../components/models/GGUFVariantList";
import { ModelFacetRow } from "../../../components/models/ModelFacetRow";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog";
import { MarkdownContent } from "../../../components/ui/MarkdownContent/MarkdownContent";
import { PageHeader } from "../../../components/ui/PageHeader/PageHeader";
import { StateBlock } from "../../../components/ui/StateBlock/StateBlock";
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
import { formatBytes, formatCount } from "../../../utils/format";
import { facetSummaryFromModel } from "../../../utils/hubModelInfo";
import {
  useDownloadedPrecisions,
  useHubModelData,
  useStoredFacets,
  useSystemMemory,
} from "../useHubModelDetail";
import "./HubModelDetail.css";
import { Body, CardTitle, Meta } from "../../../components/ui/Typography/Typography";

interface Props {
  /** Viewing a locally installed model (DB-backed). */
  isLocal?: boolean;
}

export default function HubModelDetail({ isLocal }: Props) {
  const { repoId = "" } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  /** Back returns to the tab the model was opened from: Local for installed models, Hugging Face otherwise. */
  const backPath = isLocal ? "/models" : "/models/browse";
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const { model, files, readme, localCard, ggufGroups, loading, error, setError } = useHubModelData(
    repoId,
    isLocal,
  );
  const downloadedPrecisions = useDownloadedPrecisions(repoId);
  const storedFacets = useStoredFacets(repoId, !!isLocal);
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
      navigate("/models");
    } catch (err) {
      setError(String(err));
    } finally {
      setConfirmDelete(null);
    }
  };
  const backButton = (
    <Button appearance="secondary" icon={<ArrowLeftRegular />} onClick={() => navigate(backPath)}>
      Back to Models
    </Button>
  );

  if (loading) {
    return (
      <div className="hub-model-detail__page">
        <div className="hub-model-detail__inner">
          <PageHeader
            eyebrow="● MODEL DETAILS"
            title={repoId}
            subtitle="Fetching model metadata and files from Hugging Face."
            actions={backButton}
          />
          <StateBlock icon="⏳" message={`Loading ${repoId} from Hugging Face…`} />
        </div>
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="hub-model-detail__page">
        <div className="hub-model-detail__inner">
          <PageHeader
            eyebrow="● MODEL DETAILS"
            title={repoId}
            subtitle="This model could not be displayed."
            actions={backButton}
          />
          <StateBlock icon="⚠️" message={error ?? "Model not found."} />
        </div>
      </div>
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
  const facets = isLocal ? storedFacets : remoteFacets;

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
    <div className="hub-model-detail__page">
      <div className="hub-model-detail__inner">
        <PageHeader
          eyebrow={isLocal ? "● INSTALLED MODEL" : "● HUGGING FACE MODEL"}
          title={model.id}
          subtitle={[
            // The Hub's downloads and likes only mean something for a repo that is not on this device.
            !isLocal && `⬇ ${formatCount(model.downloads)} downloads`,
            !isLocal && `❤ ${formatCount(model.likes)} likes`,
            model.gguf?.context_length &&
              `Context ${formatCount(model.gguf.context_length)} tokens`,
            model.lastModified && `Updated ${new Date(model.lastModified).toLocaleDateString()}`,
            model.gated && "🔒 gated",
          ]
            .filter(Boolean)
            .join(" · ")}
          actions={
            <div className="hub-model-detail__actions">
              {backButton}
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
        />

        {facets && (
          <Card size="small">
            <ModelFacetRow
              facets={facets}
              precisions={
                isLocal ? [...downloadedPrecisions] : ggufGroups.map((g) => g.main.precision)
              }
            />
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

        <Card>
          <CardHeader header={<CardTitle>Model Card</CardTitle>} />
          {modelContent ? (
            <MarkdownContent allowHtml>{modelContent}</MarkdownContent>
          ) : (
            <Body>No README available for this model.</Body>
          )}
        </Card>
      </div>

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
    </div>
  );
}

import {
  Badge,
  Body1,
  Button,
  Caption1,
  Card,
  CardHeader,
  makeStyles,
  Text,
  tokens,
} from "@fluentui/react-components";
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
import { GGUFVariantList } from "../../components/models/GGUFVariantList";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog/ConfirmDialog";
import { MarkdownContent } from "../../components/ui/MarkdownContent/MarkdownContent";
import { StateBlock } from "../../components/ui/StateBlock/StateBlock";
import { StatusBadge } from "../../components/ui/StatusBadge/StatusBadge";
import * as db from "../../services/database";
import * as geniex from "../../services/geniex";
import {
  estimateModelBytes,
  hubModelPageUrl,
  modelTagChips,
  precisionInfo,
  ramFitForBytes,
} from "../../services/hubApi";
import type { GGUFGroup } from "../../services/hubModels";
import { isDownloadActive, startGGUFDownload, useDownloadStore } from "../../stores/downloadStore";
import { useModelStore } from "../../stores/modelStore";
import { formatBytes, formatCount } from "../../utils/format";
import { useDownloadedPrecisions, useHubModelData, useSystemMemory } from "./useHubModelDetail";

const useStyles = makeStyles({
  page: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: tokens.spacingHorizontalL,
  },
  inner: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    maxWidth: "1200px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: tokens.spacingHorizontalM,
  },
  titleBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
  },
  title: {
    overflowWrap: "anywhere",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  tags: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalXS,
  },
  alignStart: {
    alignSelf: "flex-start",
  },
  fileRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  fileName: {
    overflowWrap: "anywhere",
  },
});

interface Props {
  /** Viewing a locally installed model (DB-backed). */
  isLocal?: boolean;
}

export default function HubModelDetail({ isLocal }: Props) {
  const styles = useStyles();
  const { repoId = "" } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const { model, files, readme, localCard, ggufGroups, loading, error, setError } = useHubModelData(
    repoId,
    isLocal,
  );
  const downloadedPrecisions = useDownloadedPrecisions(repoId);
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
  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <StateBlock icon="⏳" message={`Loading ${repoId} from Hugging Face…`} />
        </div>
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <Button
            appearance="secondary"
            icon={<ArrowLeftRegular />}
            onClick={() => navigate("/models")}
          >
            Back to Models
          </Button>
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

  const handleDownload = (group: GGUFGroup) => {
    void startGGUFDownload({ repoId, main: group.main, sidecars: group.sidecars });
  };

  const busy = isDownloading;
  const modelContent = isLocal ? localCard : readme;

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.titleBlock}>
            <Button
              appearance="secondary"
              icon={<ArrowLeftRegular />}
              onClick={() => navigate("/models")}
            >
              Back to Models
            </Button>
            <Text as="h1" size={600} weight="semibold" className={styles.title}>
              {model.id}
            </Text>
            <Body1>
              ⬇ {formatCount(model.downloads)} downloads · ❤ {formatCount(model.likes)} likes
              {model.gguf?.context_length &&
                ` · Context ${formatCount(model.gguf.context_length)} tokens`}
              {model.lastModified &&
                ` · Updated ${new Date(model.lastModified).toLocaleDateString()}`}
              {model.gated ? " · 🔒 gated" : ""}
            </Body1>
            {model.pipeline_tag && <StatusBadge>{model.pipeline_tag}</StatusBadge>}
          </div>

          <div className={styles.actions}>
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
        </div>

        {modelTagChips(model).length > 0 && (
          <div className={styles.tags}>
            {modelTagChips(model).map((tag) => (
              <Badge key={tag} appearance="outline">
                {tag}
              </Badge>
            ))}
          </div>
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
              appearance="subtle"
              className={styles.alignStart}
              icon={filesOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
              aria-expanded={filesOpen}
              onClick={() => setFilesOpen((v) => !v)}
            >
              Files ({files.length})
            </Button>
            {filesOpen &&
              files.map((f) => (
                <div key={f.path} className={styles.fileRow}>
                  <Text size={200} className={styles.fileName}>
                    {f.type === "directory" ? "📁" : "📄"} {f.path}
                  </Text>
                  <Caption1>{formatBytes(f.size)}</Caption1>
                </div>
              ))}
          </Card>
        )}

        <Card>
          <CardHeader header={<Text weight="semibold">Model Card</Text>} />
          {modelContent ? (
            <MarkdownContent allowHtml>{modelContent}</MarkdownContent>
          ) : (
            <Body1>No README available for this model.</Body1>
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

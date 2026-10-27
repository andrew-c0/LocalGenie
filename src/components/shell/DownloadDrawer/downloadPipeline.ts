import * as db from "../../../services/database";
import { downloadFile, importGGUF } from "../../../services/download";
import * as geniex from "../../../services/geniex";
import { fetchContextLength } from "../../../services/hubApi";
import { type GGUFVariant, useDownloadStore } from "../../../stores/downloadStore";
import { useModelStore } from "../../../stores/modelStore";
import type { DownloadedModelMeta } from "../../../types";
import { toast } from "../../../utils/toast";

const hfFileUrl = (repoId: string, filename: string) =>
  `https://huggingface.co/${repoId}/resolve/main/${filename}`;

const baseName = (path: string) => path.split("/").pop() ?? path;

/**
 * The download folder for a repo, under Downloads: `owner/name` becomes `owner--name`. Every file of
 * the repo lands here, so two repos that ship the same file name (such as `mmproj-F16.gguf`) never
 * share a file.
 */
export function repoFolder(repoId: string): string {
  return repoId.replace("/", "--");
}

/**
 * Run the GGUF pipeline for a queued variant: download the projector and the main file into the
 * repo's folder, then import that folder into the GenieX cache. Resuming calls this again; the
 * backend continues from the partial files and keeps the finished ones. Failures are recorded on
 * the entry rather than thrown, so the drawer shows them.
 */
export async function runGGUFDownload(variant: GGUFVariant): Promise<void> {
  const { repoId, main, sidecars } = variant;
  const store = useDownloadStore.getState();
  // Only a queued entry starts. Anything else is already running, finished or cancelled.
  if (store.downloads.find((d) => d.id === repoId)?.status !== "queued") return;
  store.setStatus(repoId, "downloading");
  toast.info("Download started", repoId);

  const folder = repoFolder(repoId);
  const fileName = baseName(main.filename);
  try {
    const sidecarNames: string[] = [];
    for (const sidecar of sidecars) {
      const name = baseName(sidecar.filename);
      await downloadFile(repoId, hfFileUrl(repoId, sidecar.filename), folder, name).then(
        () => sidecarNames.push(name),
        (err: unknown) => {
          // A cancel must stop the whole pipeline; any other projector failure is skipped, with a
          // warning, so the model imports without it.
          if (String(err).includes("cancelled")) throw err;
          toast.error("Projector not downloaded", `${name}: ${String(err)}`);
        },
      );
    }

    await downloadFile(repoId, hfFileUrl(repoId, main.filename), folder, fileName);
    // The backend emits model-pull-start/complete around the import and sets the status.
    await importGGUF(folder, repoId, fileName, main.precision, sidecarNames);
  } catch (err) {
    const message = String(err);
    if (message.includes("cancelled")) {
      store.setStatus(repoId, "cancelled");
      toast.info("Download cancelled", repoId);
    } else {
      store.setStatus(repoId, "error", message);
      toast.error("Download failed", `${repoId}: ${message}`);
    }
  }
}

/**
 * After a successful import: refresh the CLI model list and persist the metadata the model
 * card shows. Both are best-effort.
 */
export async function refreshAfterImport(repoId: string): Promise<void> {
  // Metadata first: the model list refresh triggers the chat context bar, which reads this row.
  try {
    const meta = await fetchDownloadedModelMeta(repoId);
    await db.upsertDownloadedModel(
      repoId,
      meta.precision ?? null,
      meta.contextSize ?? null,
      meta.paramCount ?? null,
      meta.repoUrl ?? null,
      meta.modelCard ?? null,
    );
  } catch {
    // metadata is a nice-to-have
  }
  try {
    useModelStore.getState().setModels(await geniex.listModels());
  } catch {
    // CLI list refresh is best-effort
  }
}

/**
 * Downloaded-model metadata from the local DB. The context size falls back to the
 * HF config.json when the DB row does not have it.
 */
async function fetchDownloadedModelMeta(repoId: string): Promise<DownloadedModelMeta> {
  const rows = await db.listDownloadedModels();
  const row = rows.find((r) => r.name === repoId);
  // The Hub's GGUF metadata is the source of truth; the header value written at import is the fallback.
  const contextSize = (await fetchContextLength(repoId)) ?? row?.context_size ?? null;
  return {
    precision: row?.precision ?? undefined,
    contextSize: contextSize ?? undefined,
    paramCount: row?.param_count ?? undefined,
    repoUrl: row?.repo_url ?? undefined,
    modelCard: row?.model_card ?? undefined,
  };
}

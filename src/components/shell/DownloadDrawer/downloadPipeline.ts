import { importAihubZip } from "../../../services/aihub";
import * as db from "../../../services/database";
import { downloadFile, importGGUF } from "../../../services/download";
import * as geniex from "../../../services/geniex";
import { fetchContextLength } from "../../../services/hubApi";
import {
  type AihubDownload,
  type GGUFVariant,
  useDownloadStore,
} from "../../../stores/downloadStore";
import { useModelStore } from "../../../stores/modelStore";
import type { DownloadedModelMeta } from "../../../types";
import { serializeFacets } from "../../../utils/hubModelInfo";
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
    const facets = variant.facets ? serializeFacets(variant.facets) : null;
    await importGGUF(folder, repoId, fileName, main.precision, sidecarNames, facets);
  } catch (err) {
    recordFailure(repoId, err);
  }
}

/**
 * Run the AI Hub pipeline for a queued zip: download it into its folder under Downloads, then
 * import it into the GenieX cache. The backend deletes the zip after a successful import and keeps
 * it after a failed one, so a retry reuses it.
 */
export async function runAihubDownload(download: AihubDownload): Promise<void> {
  const { modelName, downloadUrl, folder, zipName, precision, facets } = download;
  const store = useDownloadStore.getState();
  if (store.downloads.find((d) => d.id === modelName)?.status !== "queued") return;
  store.setStatus(modelName, "downloading");
  toast.info("Download started", modelName);

  try {
    await downloadFile(modelName, downloadUrl, folder, zipName);
    // The backend emits model-pull-start/complete around the import and sets the status.
    await importAihubZip(folder, zipName, modelName, precision, serializeFacets(facets));
  } catch (err) {
    recordFailure(modelName, err);
  }
}

/** Mark a pipeline entry cancelled or failed, and tell the user. */
function recordFailure(id: string, err: unknown): void {
  const store = useDownloadStore.getState();
  const message = String(err);
  if (message.includes("cancelled")) {
    store.setStatus(id, "cancelled");
    toast.info("Download cancelled", id);
  } else {
    store.setStatus(id, "error", message);
    toast.error("Download failed", `${id}: ${message}`);
  }
}

/** Refresh the local library from the CLI model list. Best-effort. */
export async function refreshModelList(): Promise<void> {
  try {
    useModelStore.getState().setModels(await geniex.listModels());
  } catch {
    // CLI list refresh is best-effort
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
      meta.facets ?? null,
    );
  } catch {
    // metadata is a nice-to-have
  }
  await refreshModelList();
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
    facets: row?.facets ?? undefined,
  };
}

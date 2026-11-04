import { importAihubZip } from "../../../services/aihub";
import * as db from "../../../services/database";
import { downloadFile, importGGUF } from "../../../services/download";
import { fetchContextLength } from "../../../services/hubApi";
import { installRuntime } from "../../../services/runtimes";
import {
  type AihubDownload,
  type GGUFVariant,
  type RuntimeDownload,
  runtimeDownloadId,
  useDownloadStore,
} from "../../../stores/downloadStore";
import type { DownloadedModelMeta } from "../../../types";
import { serializeFacets } from "../../../utils/hubModelInfo";
import { networkErrorMessage, SERVICE_NAMES } from "../../../utils/networkError";
import { refreshAfterRuntimeChange, refreshModelList } from "../../../utils/runtimeUsage";
import { toast } from "../../../utils/toast";

const hfFileUrl = (repoId: string, filename: string) =>
  `https://huggingface.co/${repoId}/resolve/main/${filename}`;

const baseName = (path: string) => path.split("/").pop() ?? path;

/**
 * The download folder for a repo, under Downloads: `owner/name` becomes `owner--name`. Every file of
 * the repo lands here, so two repos that ship the same file name (such as `mmproj-F16.gguf`) never
 * share a file.
 */
function repoFolder(repoId: string): string {
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
          toast.error(
            "Projector not downloaded",
            `${name}: ${networkErrorMessage(err, SERVICE_NAMES.huggingFace)}`,
          );
        },
      );
    }

    await downloadFile(repoId, hfFileUrl(repoId, main.filename), folder, fileName);
    // The backend emits model-pull-start/complete around the import and sets the status.
    const facets = variant.facets ? serializeFacets(variant.facets) : null;
    await importGGUF(folder, repoId, fileName, main.precision, sidecarNames, facets);
  } catch (err) {
    recordFailure(repoId, err, {
      title: "Download",
      name: repoId,
      subject: SERVICE_NAMES.huggingFace,
    });
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
    recordFailure(modelName, err, {
      title: "Download",
      name: modelName,
      subject: SERVICE_NAMES.aihub,
    });
  }
}

/**
 * Run a queued runtime install or update through `runtime_install`, the GenieX CLI included. The entry
 * finishes or fails here; the drawer's events only report progress. Afterwards the runtime list and that
 * runtime's usage state are re-read. Uninstalls do not run here (see `utils/runtimeUninstall.ts`).
 */
export async function runRuntimeInstall(runtime: RuntimeDownload): Promise<void> {
  const id = runtimeDownloadId(runtime.runtimeId);
  const store = useDownloadStore.getState();
  if (store.downloads.find((d) => d.id === id)?.status !== "queued") return;
  store.setStatus(id, "downloading");
  toast.info("Install started", runtime.displayName);

  try {
    // `runtime_install` resolves to the installed version.
    const version = await installRuntime(runtime.runtimeId, runtime.version);
    toast.success(`${runtime.displayName} installed`, `Version ${version}`);
    store.setStatus(id, "finished");
  } catch (err) {
    recordFailure(id, err, {
      title: "Install",
      name: runtime.displayName,
      subject: SERVICE_NAMES.github,
    });
  } finally {
    // The operation may have changed the list, or failed partway: the Settings cards, the feature locks
    // and the model library read it.
    await refreshAfterRuntimeChange(runtime.runtimeId);
  }
}

interface FailureContext {
  /** The action in the toast title: "Download" or "Install". */
  title: string;
  /** What failed, named in the toast body. */
  name: string;
  /** The service the request went to, named in an offline, rate-limit or timeout message. */
  subject: string;
}

/**
 * Mark a pipeline entry cancelled or failed, and tell the user. The entry keeps the raw error, so the
 * drawer can show the technical text; the toast shows the friendly text from `networkErrorMessage`.
 */
function recordFailure(id: string, err: unknown, context: FailureContext): void {
  const store = useDownloadStore.getState();
  const message = String(err);
  if (message.includes("cancelled")) {
    store.setStatus(id, "cancelled");
    toast.info(`${context.title} cancelled`, context.name);
  } else {
    store.setStatus(id, "error", message);
    toast.error(
      `${context.title} failed`,
      `${context.name}: ${networkErrorMessage(err, context.subject)}`,
    );
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

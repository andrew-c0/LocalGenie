import { create } from "zustand";
import { deleteDirectory, downloadFile, importGGUF } from "../services/download";
import type { GGUFFile } from "../services/hubModels";

export type DownloadStatus = "downloading" | "importing" | "finished" | "error" | "cancelled";

/** One GGUF file to fetch from a Hugging Face repo, with its sidecars (mmproj, mtp, …). */
export interface GGUFVariant {
  repoId: string;
  main: GGUFFile;
  sidecars: GGUFFile[];
}

export interface DownloadItem {
  /** Unique key per download (repo ID for model downloads). */
  id: string;
  label: string;
  /** What to fetch, kept so a cancelled download can be resumed. */
  variant?: GGUFVariant;
  received: number;
  total: number | null;
  /** Bytes per second (smoothed). */
  speed: number;
  status: DownloadStatus;
  error?: string;
  startedAt: number;
  finishedAt?: number;
  /** Progress message during import phase. */
  importingProgress?: string;
}

interface DownloadState {
  downloads: DownloadItem[];
  /** Insert or update a download entry (keeps existing fields). */
  upsert: (item: Partial<DownloadItem> & { id: string }) => void;
  /** Patch progress fields for an active download. */
  patchProgress: (id: string, received: number, total: number | null, speed: number) => void;
  /** Set import progress message during the import phase. */
  setImportingProgress: (id: string, progress: string) => void;
  setStatus: (id: string, status: DownloadStatus, error?: string) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
}

/** True while bytes are arriving or the CLI is importing them. */
export function isDownloadActive(status: DownloadStatus | undefined): boolean {
  return status === "downloading" || status === "importing";
}

export const useDownloadStore = create<DownloadState>((set) => ({
  downloads: [],
  upsert: (item) =>
    set((state) => {
      const existing = state.downloads.find((d) => d.id === item.id);
      if (existing) {
        return {
          downloads: state.downloads.map((d) => (d.id === item.id ? { ...d, ...item } : d)),
        };
      }
      return {
        downloads: [
          {
            label: item.id,
            received: 0,
            total: null,
            speed: 0,
            status: "downloading" as DownloadStatus,
            startedAt: Date.now(),
            ...item,
          },
          ...state.downloads,
        ],
      };
    }),
  patchProgress: (id, received, total, speed) =>
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id && d.status === "downloading" ? { ...d, received, total, speed } : d,
      ),
    })),
  setImportingProgress: (id, progress) =>
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id && d.status === "importing" ? { ...d, importingProgress: progress } : d,
      ),
    })),
  setStatus: (id, status, error) =>
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id
          ? { ...d, status, error, finishedAt: isDownloadActive(status) ? undefined : Date.now() }
          : d,
      ),
    })),
  remove: (id) => set((state) => ({ downloads: state.downloads.filter((d) => d.id !== id) })),
  clearFinished: () =>
    set((state) => ({
      downloads: state.downloads.filter((d) => isDownloadActive(d.status)),
    })),
}));

const hfFileUrl = (repoId: string, filename: string) =>
  `https://huggingface.co/${repoId}/resolve/main/${filename}`;

const baseName = (path: string) => path.split("/").pop() ?? path;

/**
 * Download a GGUF variant, import it into the GenieX cache, then fetch its sidecars.
 * Resuming a cancelled download calls this again; the backend continues from the partial file.
 * Failures are recorded on the entry rather than thrown, so the drawer shows them.
 */
export async function startGGUFDownload(variant: GGUFVariant): Promise<void> {
  const { repoId, main, sidecars } = variant;
  const store = useDownloadStore.getState();
  // A second start for the same repo would fail in the backend and mark the running entry as failed.
  if (isDownloadActive(store.downloads.find((d) => d.id === repoId)?.status)) return;

  store.upsert({
    id: repoId,
    label: repoId,
    variant,
    status: "downloading",
    error: undefined,
    finishedAt: undefined,
    startedAt: Date.now(),
  });

  const fileName = baseName(main.filename);
  try {
    const downloadedPath = await downloadFile(repoId, hfFileUrl(repoId, main.filename), fileName);
    // The backend emits model-pull-start/complete around the import and sets the status.
    const modelDir = await importGGUF(downloadedPath, repoId, fileName, main.precision);
    await deleteDirectory(modelDir);

    for (const sidecar of sidecars) {
      await downloadFile(
        repoId,
        hfFileUrl(repoId, sidecar.filename),
        baseName(sidecar.filename),
      ).catch(() => undefined);
    }
  } catch (err) {
    const message = String(err);
    if (message.includes("cancelled")) {
      store.setStatus(repoId, "cancelled");
    } else {
      store.setStatus(repoId, "error", message);
    }
  }
}

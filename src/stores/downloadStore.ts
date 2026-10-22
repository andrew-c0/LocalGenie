import { create } from "zustand";
import type { GGUFFile } from "../services/hubModels";

/**
 * `queued` = requested by the app, not yet picked up by the download drawer.
 * The drawer owns the pipeline; other components only enqueue and read state.
 */
export type DownloadStatus =
  | "queued"
  | "downloading"
  | "importing"
  | "finished"
  | "error"
  | "cancelled";

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
  /** Queue a GGUF variant for download. Ignored while the same repo is already active. */
  enqueue: (variant: GGUFVariant) => void;
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

/** True while queued, downloading or importing. */
export function isDownloadActive(status: DownloadStatus | undefined): boolean {
  return status === "queued" || status === "downloading" || status === "importing";
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  downloads: [],
  enqueue: (variant) => {
    const repoId = variant.repoId;
    if (isDownloadActive(get().downloads.find((d) => d.id === repoId)?.status)) return;
    get().upsert({
      id: repoId,
      label: repoId,
      variant,
      status: "queued",
      error: undefined,
      finishedAt: undefined,
      startedAt: Date.now(),
    });
  },
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

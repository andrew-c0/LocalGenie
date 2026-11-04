import { create } from "zustand";
import type { GGUFFile } from "../services/hubModels";
import type { HubFacetSummary } from "../utils/hubModelInfo";
import { SERVICE_NAMES } from "../utils/networkError";

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
  /** The repo's facets, stored with the imported model. */
  facets?: HubFacetSummary;
}

/** One QAIRT zip from Qualcomm AI Hub: what the pipeline downloads and then imports. */
export interface AihubDownload {
  /** GenieX name, `qualcomm/<display name>`. It is also the download id. */
  modelName: string;
  /** Public AI Hub asset URL. */
  downloadUrl: string;
  /** Download folder under Downloads, and the zip's file name in it. */
  folder: string;
  zipName: string;
  precision: string;
  facets: HubFacetSummary;
}

/** One runtime install or update, run by the drawer like a model download. Every runtime goes the same way. */
export interface RuntimeDownload {
  /** Registry id, such as `geniex`, `sd-cpp` or `sherpa-onnx`. */
  runtimeId: string;
  displayName: string;
  /** Release to install. The latest when omitted. A runtime with one release (GenieX) ignores it. */
  version?: string;
}

export interface DownloadItem {
  /** Unique key per download (repo ID for model downloads; GenieX name for AI Hub zips; `runtime:<id>` for runtimes). */
  id: string;
  label: string;
  /** What to fetch, kept so a cancelled download can be resumed. */
  variant?: GGUFVariant;
  /** AI Hub zip to fetch and import, kept so a cancelled download can be resumed. */
  aihub?: AihubDownload;
  /** Runtime install or update to run, kept so a cancelled install can be resumed. */
  runtime?: RuntimeDownload;
  received: number;
  /** Total bytes, or null when the size is not known. */
  total: number | null;
  /** Bytes per second (smoothed). */
  speed: number;
  status: DownloadStatus;
  error?: string;
  startedAt: number;
  finishedAt?: number;
  /** Progress message during the import (or runtime install) phase. */
  importingProgress?: string;
}

interface DownloadState {
  downloads: DownloadItem[];
  /** Queue a GGUF variant for download. Ignored while the same repo is already active. */
  enqueue: (variant: GGUFVariant) => void;
  /** Queue an AI Hub zip. Ignored while the same model is already active. */
  enqueueAihub: (download: AihubDownload) => void;
  /** Queue a runtime install or update. Ignored while the same runtime's install is already active. */
  enqueueRuntime: (runtime: RuntimeDownload) => void;
  /** Queue a cancelled or failed entry again; its fetch, import or install is kept on the entry. */
  requeue: (id: string) => void;
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

/** The service a download comes from, named in its failure text: AI Hub zips, runtime installs (GitHub), else Hugging Face. */
export function downloadSourceName(download: Pick<DownloadItem, "aihub" | "runtime">): string {
  if (download.aihub) return SERVICE_NAMES.aihub;
  if (download.runtime) return SERVICE_NAMES.github;
  return SERVICE_NAMES.huggingFace;
}

/** True while queued, downloading or importing. */
export function isDownloadActive(status: DownloadStatus | undefined): boolean {
  return status === "queued" || status === "downloading" || status === "importing";
}

/** Drawer id of a runtime's install or update: `runtime:<id>`. The backend's cancel takes the same id. */
export function runtimeDownloadId(runtimeId: string): string {
  return `runtime:${runtimeId}`;
}

/** True while the runtime's install or update is queued or running in the drawer. */
export function isRuntimeInstallActive(downloads: DownloadItem[], runtimeId: string): boolean {
  const id = runtimeDownloadId(runtimeId);
  return downloads.some((d) => d.id === id && isDownloadActive(d.status));
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
      aihub: undefined,
      status: "queued",
      error: undefined,
      finishedAt: undefined,
      startedAt: Date.now(),
    });
  },
  enqueueAihub: (download) => {
    const id = download.modelName;
    if (isDownloadActive(get().downloads.find((d) => d.id === id)?.status)) return;
    get().upsert({
      id,
      label: id,
      aihub: download,
      variant: undefined,
      status: "queued",
      error: undefined,
      finishedAt: undefined,
      startedAt: Date.now(),
    });
  },
  enqueueRuntime: (runtime) => {
    const id = runtimeDownloadId(runtime.runtimeId);
    if (isDownloadActive(get().downloads.find((d) => d.id === id)?.status)) return;
    get().upsert({
      id,
      label: runtime.displayName,
      runtime,
      variant: undefined,
      aihub: undefined,
      received: 0,
      total: null,
      speed: 0,
      importingProgress: undefined,
      status: "queued",
      error: undefined,
      finishedAt: undefined,
      startedAt: Date.now(),
    });
  },
  requeue: (id) => {
    const item = get().downloads.find((d) => d.id === id);
    if (!item || (!item.variant && !item.aihub && !item.runtime) || isDownloadActive(item.status)) {
      return;
    }
    get().upsert({
      id,
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

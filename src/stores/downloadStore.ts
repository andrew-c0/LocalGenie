import { create } from "zustand";
import type { GGUFFile } from "../services/hubModels";
import type {
  PlaygroundDownloadProgress,
  PlaygroundDownloadView,
  PlaygroundModelKind,
} from "../types";
import type { HubFacetSummary } from "../utils/hubModelInfo";
import { SERVICE_NAMES } from "../utils/networkError";
import { playgroundPercent } from "../utils/playground";
import {
  advancePlaygroundTransfer,
  type PlaygroundTransfer,
  playgroundTotalBytes,
} from "../utils/playgroundTransfer";

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

/**
 * A Playground model download. The backend fetches the files (and, for OCR, imports them) and reports
 * through the `playground-download-*` events; the drawer only shows them. It is never queued.
 */
export interface PlaygroundDownload {
  kind: PlaygroundModelKind;
  /** The model id the backend uses. The drawer id is `playground:<modelId>`. */
  modelId: string;
  /** The model's name, the drawer label. */
  name: string;
  /** The service the files come from, named in a failure. */
  source: string;
  /** Latest progress event: the file being fetched and its bytes. Null until the first one arrives. */
  progress: PlaygroundDownloadProgress | null;
  /** Bytes over all files and the speed, built from the events. Null until the first one arrives. */
  transfer: PlaygroundTransfer | null;
}

/** What starting a Playground download takes: the descriptor without its progress and transfer. */
export type PlaygroundStart = Omit<PlaygroundDownload, "progress" | "transfer">;

export interface DownloadItem {
  /** Unique key per download (repo ID for model downloads; GenieX name for AI Hub zips; `runtime:<id>` for runtimes; `playground:<id>` for Playground models). */
  id: string;
  label: string;
  /** What to fetch, kept so a cancelled download can be resumed. */
  variant?: GGUFVariant;
  /** AI Hub zip to fetch and import, kept so a cancelled download can be resumed. */
  aihub?: AihubDownload;
  /** Runtime install or update to run, kept so a cancelled install can be resumed. */
  runtime?: RuntimeDownload;
  /** A Playground model download, run by the backend. Retried through `retryPlaygroundDownload`, not the queue. */
  playground?: PlaygroundDownload;
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

/** A drawer item that belongs to a Playground model download. */
type PlaygroundItem = DownloadItem & { playground: PlaygroundDownload };

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
  /** Show a Playground model download as running. Ignored while the same model is already active. Also restarts a finished, failed or cancelled one. */
  startPlayground: (download: PlaygroundStart) => void;
  /** Record the latest progress of a running Playground download; its speed and size follow. Ignored once it is no longer active. */
  setPlaygroundProgress: (modelId: string, progress: PlaygroundDownloadProgress) => void;
  /** Mark an active Playground download finished. */
  finishPlayground: (modelId: string) => void;
  /** Mark an active Playground download failed. The raw error is kept; the drawer shows the friendly text. */
  failPlayground: (modelId: string, error: string) => void;
  /** Mark an active Playground download cancelled (not failed). */
  cancelPlayground: (modelId: string) => void;
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

/** The service a download comes from, named in its failure text: a Playground model's source, AI Hub zips, runtime installs (GitHub), else Hugging Face. */
export function downloadSourceName(
  download: Pick<DownloadItem, "aihub" | "runtime" | "playground">,
): string {
  if (download.playground) return download.playground.source;
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

/** Drawer id of a Playground model download: `playground:<model id>`, the id the backend's `cancel_download` takes. */
export function playgroundDownloadId(modelId: string): string {
  return `playground:${modelId}`;
}

/** True while the runtime's install or update is queued or running in the drawer. */
export function isRuntimeInstallActive(downloads: DownloadItem[], runtimeId: string): boolean {
  const id = runtimeDownloadId(runtimeId);
  return downloads.some((d) => d.id === id && isDownloadActive(d.status));
}

/**
 * The entries the drawer's pipeline starts: queued ones, other than Playground downloads, which the
 * backend runs and which are never queued.
 */
export function pipelineQueueOf(downloads: DownloadItem[]): DownloadItem[] {
  return downloads.filter((d) => d.status === "queued" && !d.playground);
}

/** True while the Playground model's download is running in the drawer. */
export function isPlaygroundDownloadActive(downloads: DownloadItem[], modelId: string): boolean {
  const id = playgroundDownloadId(modelId);
  return downloads.some((d) => d.id === id && isDownloadActive(d.status));
}

/**
 * The drawer entry an import event (`model-pull-*`, keyed by a Hugging Face repo id) belongs to. A
 * repo's own entry wins while it is active. Otherwise it is the one active Playground OCR download: an
 * OCR model imports under its repo, and the drawer has no entry for that repo. Null when neither
 * applies, so the caller keeps its own entry.
 */
export function importTargetOf(downloads: DownloadItem[], repoId: string): string | null {
  if (downloads.some((d) => d.id === repoId && isDownloadActive(d.status))) return repoId;
  const ocrActive = downloads.filter(
    (d) => d.playground?.kind === "ocr" && isDownloadActive(d.status),
  );
  return ocrActive.length === 1 ? (ocrActive[0]?.id ?? null) : null;
}

/**
 * What a model row shows of its Playground download, from the drawer entry. Running (also while an OCR
 * model is imported), failed and cancelled downloads have a view; any other entry, or none, has none.
 */
export function playgroundDownloadViewOf(
  item: DownloadItem | undefined,
): PlaygroundDownloadView | null {
  if (!item?.playground) return null;
  const { source, progress } = item.playground;
  if (isDownloadActive(item.status)) {
    return { status: "downloading", percent: playgroundPercent(progress), error: null, source };
  }
  if (item.status === "error" || item.status === "cancelled") {
    return {
      status: item.status,
      percent: null,
      error: item.error ?? null,
      source,
    };
  }
  return null;
}

/**
 * The drawer bar's fraction, 0 to 1, or null when the bar has no fraction yet (an indeterminate bar).
 * A Playground download's is its whole-download percentage; the others use their bytes.
 */
export function progressFractionOf(item: DownloadItem): number | null {
  if (item.playground) {
    const percent = playgroundPercent(item.playground.progress);
    return percent === null ? null : percent / 100;
  }
  return item.total && item.total > 0 ? item.received / item.total : null;
}

function isPlaygroundItem(item: DownloadItem): item is PlaygroundItem {
  return item.playground !== undefined;
}

/** Apply `change` to a model's Playground entry, only while that download is still active. */
function updateActivePlayground(
  downloads: DownloadItem[],
  modelId: string,
  change: (item: PlaygroundItem) => Partial<DownloadItem>,
): DownloadItem[] {
  const id = playgroundDownloadId(modelId);
  return downloads.map((d) => {
    if (d.id !== id || !isPlaygroundItem(d) || !isDownloadActive(d.status)) return d;
    return { ...d, ...change(d) };
  });
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
  startPlayground: (download) => {
    const id = playgroundDownloadId(download.modelId);
    if (isDownloadActive(get().downloads.find((d) => d.id === id)?.status)) return;
    get().upsert({
      id,
      label: download.name,
      playground: { ...download, progress: null, transfer: null },
      variant: undefined,
      aihub: undefined,
      runtime: undefined,
      received: 0,
      total: null,
      speed: 0,
      importingProgress: undefined,
      status: "downloading",
      error: undefined,
      finishedAt: undefined,
      startedAt: Date.now(),
    });
  },
  setPlaygroundProgress: (modelId, progress) =>
    set((state) => ({
      downloads: updateActivePlayground(state.downloads, modelId, (item) => {
        const transfer = advancePlaygroundTransfer(item.playground.transfer, progress, Date.now());
        return {
          playground: { ...item.playground, progress, transfer },
          received: transfer.sample.received,
          total: playgroundTotalBytes(transfer),
          speed: transfer.sample.speed,
        };
      }),
    })),
  finishPlayground: (modelId) =>
    set((state) => ({
      downloads: updateActivePlayground(state.downloads, modelId, () => ({
        status: "finished",
        error: undefined,
        importingProgress: undefined,
        finishedAt: Date.now(),
      })),
    })),
  failPlayground: (modelId, error) =>
    set((state) => ({
      downloads: updateActivePlayground(state.downloads, modelId, () => ({
        status: "error",
        error,
        importingProgress: undefined,
        finishedAt: Date.now(),
      })),
    })),
  cancelPlayground: (modelId) =>
    set((state) => ({
      downloads: updateActivePlayground(state.downloads, modelId, () => ({
        status: "cancelled",
        error: undefined,
        importingProgress: undefined,
        finishedAt: Date.now(),
      })),
    })),
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

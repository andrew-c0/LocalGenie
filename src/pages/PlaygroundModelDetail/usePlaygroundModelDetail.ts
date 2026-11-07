import { useMemo } from "react";
import type { CatalogFailure } from "../../components/models/PlaygroundModelsCatalog/usePlaygroundModelsCatalog";
import { usePlaygroundLocalDelete } from "../../components/models/usePlaygroundLocalDelete";
import { usePlaygroundStoredCatalogs } from "../../components/models/usePlaygroundStoredCatalogs";
import { toggleToolModel } from "../../components/playground/playgroundSelection";
import { usePlaygroundCatalogs } from "../../components/playground/usePlaygroundCatalogs";
import type { PlaygroundModelDelete } from "../../components/playground/usePlaygroundModelDelete";
import {
  usePlaygroundDownload,
  usePlaygroundDownloadBusy,
} from "../../hooks/usePlaygroundDownload";
import { routeById } from "../../navigation/routeUtils";
import { useSpeechStore } from "../../stores/speechStore";
import type { PlaygroundDownloadView, PlaygroundModelKind } from "../../types";
import { audioTaskUrl } from "../../utils/audioTask";
import {
  collectInstalledPlaygroundModels,
  type PlaygroundLocalGroup,
  type PlaygroundLocalModel,
} from "../../utils/playgroundLocalModels";
import {
  type CatalogEntry,
  detailStatusOf,
  findCatalogEntry,
  groupOfEntry,
  type PlaygroundDetailStatus,
  toolTargetOf,
} from "../../utils/playgroundModelDetail";

const CATALOG_KINDS: PlaygroundModelKind[] = ["image", "upscale", "speech", "ocr"];

/** Everything the Playground model page reads and does, for one model. */
export interface PlaygroundModelDetailView {
  status: PlaygroundDetailStatus;
  entry: CatalogEntry | null;
  /** The catalogs that failed to read, each with its retry. */
  failures: CatalogFailure[];
  /** The model's Playground download while it runs, or null. */
  download: PlaygroundDownloadView | null;
  /** Another Playground download is running. Downloads run one at a time. */
  isAnyDownloading: boolean;
  /** The installed copy of the model, or null when it is not installed. */
  installed: PlaygroundLocalModel | null;
  /** The name of the tool the model opens in, or null when the tool has no route. */
  toolTitle: string | null;
  deletion: PlaygroundModelDelete<PlaygroundLocalModel>;
  /** Selects the model in its tool. Returns the tool's address to open, or null when there is none. */
  openTool: () => string | null;
}

/**
 * The data of one Playground model's page: its catalog entry (read through the Playground stores), each
 * catalog's read state, its download, and delete and open-in-tool for the model.
 */
export function usePlaygroundModelDetail(
  group: PlaygroundLocalGroup | null,
  modelId: string,
): PlaygroundModelDetailView {
  const loads = usePlaygroundCatalogs();
  const stored = usePlaygroundStoredCatalogs();
  const isAnyDownloading = usePlaygroundDownloadBusy();
  const download = usePlaygroundDownload(modelId);
  const installedModels = useMemo(() => collectInstalledPlaygroundModels(stored), [stored]);
  const deletion = usePlaygroundLocalDelete(installedModels);

  const entry = group === null ? null : findCatalogEntry(stored, group, modelId);
  const failures = CATALOG_KINDS.flatMap((kind): CatalogFailure[] => {
    const load = loads[kind];
    return load.loadError === null ? [] : [{ kind, message: load.loadError, retry: load.retry }];
  });
  const installed =
    entry === null
      ? null
      : (installedModels.find(
          (model) => model.id === entry.model.id && model.kind === groupOfEntry(entry),
        ) ?? null);
  const toolTitle = entry ? (routeById(toolTargetOf(entry).toolId)?.title ?? null) : null;

  const openTool = (): string | null => {
    if (!entry) return null;
    const target = toolTargetOf(entry);
    // Picks the model as a click in the selector does, which also starts the GenieX server for OCR.
    toggleToolModel(target.toolId, entry.model.id, false);
    if (target.enhanceKind) useSpeechStore.getState().setEnhanceKind(target.enhanceKind);
    if (target.audioTask) return audioTaskUrl(target.audioTask);
    return routeById(target.toolId)?.path ?? null;
  };

  return {
    status: detailStatusOf(entry, stored, failures.length),
    entry,
    failures,
    download,
    isAnyDownloading,
    installed,
    toolTitle,
    deletion,
    openTool,
  };
}

import { useMemo } from "react";
import { usePlaygroundDownloadBusy } from "../../../hooks/usePlaygroundDownload";
import type { PlaygroundModelKind } from "../../../types";
import {
  collectInstalledPlaygroundModels,
  type PlaygroundLocalModel,
} from "../../../utils/playgroundLocalModels";
import { buildCatalogRows, type CatalogModelRow } from "../../../utils/playgroundModelsCatalog";
import { usePlaygroundCatalogs } from "../../playground/usePlaygroundCatalogs";
import { usePlaygroundLocalDelete } from "../usePlaygroundLocalDelete";
import { usePlaygroundStoredCatalogs } from "../usePlaygroundStoredCatalogs";

const KINDS: PlaygroundModelKind[] = ["image", "upscale", "speech", "ocr"];

/** A catalog that failed to read, with its message and the call that reads it again. */
export interface CatalogFailure {
  kind: PlaygroundModelKind;
  message: string;
  retry: () => void;
}

export interface PlaygroundModelsCatalogState {
  /** Every curated model, of all four catalogs. */
  rows: CatalogModelRow[];
  /** A catalog is still being read for the first time. */
  isLoading: boolean;
  failures: CatalogFailure[];
  /** A Playground download is queued or running. Other Download buttons wait for it. */
  isAnyDownloading: boolean;
  /** The installed model whose delete is running, or null. */
  deletingModelId: string | null;
  /** The installed model waiting for delete confirmation, or null. */
  pendingModel: PlaygroundLocalModel | null;
  /** Asks to delete the installed model with this id. */
  requestDelete: (modelId: string) => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
}

/**
 * The data of the Playground models page: the curated models from the four catalogs (read through
 * the Playground stores), each catalog's read state, the download busy flag, and delete of an installed
 * model through the tool's own delete.
 */
export function usePlaygroundModelsCatalog(): PlaygroundModelsCatalogState {
  const loads = usePlaygroundCatalogs();
  const stored = usePlaygroundStoredCatalogs();
  const isAnyDownloading = usePlaygroundDownloadBusy();

  const rows = useMemo(() => buildCatalogRows(stored), [stored]);
  const installed = useMemo(() => collectInstalledPlaygroundModels(stored), [stored]);
  const deletion = usePlaygroundLocalDelete(installed);

  const failures = KINDS.flatMap((kind): CatalogFailure[] => {
    const load = loads[kind];
    return load.loadError === null ? [] : [{ kind, message: load.loadError, retry: load.retry }];
  });
  const isLoading = KINDS.some((kind) => stored[kind] === null && loads[kind].loadError === null);

  return {
    rows,
    isLoading,
    failures,
    isAnyDownloading,
    deletingModelId: deletion.deletingModelId,
    pendingModel: deletion.pendingModel,
    requestDelete: (modelId) => {
      const model = installed.find((candidate) => candidate.id === modelId);
      if (model) deletion.requestDelete(model);
    },
    cancelDelete: deletion.cancelDelete,
    confirmDelete: deletion.confirmDelete,
  };
}

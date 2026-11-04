import { useEffect, useMemo, useState } from "react";
import { useAsyncData } from "../../hooks/useAsyncData";
import * as db from "../../services/database";
import {
  fetchHubModelReadme,
  getHubModel,
  type HubFileEntry,
  type HubModel,
  listHubModelFiles,
} from "../../services/hubApi";
import { convertToGGUFFiles, groupGGUFFiles } from "../../services/hubModels";
import { useModelStore } from "../../stores/modelStore";

/** True when a stored name is the repo: the same id, or the id with a precision suffix (`org/repo:Q4_K_M`). */
function isSameRepo(name: string, repoId: string): boolean {
  return repoId === name || repoId.startsWith(`${name}:`);
}

/** An installed model's synthetic Hub-shaped record and the stored card to show. */
interface LocalModelData {
  model: HubModel;
  card: string | null;
}

/** Reads an installed model from the database. The card is the exact-name row's, else the repo's first row. */
async function loadLocalModel(repoId: string): Promise<LocalModelData> {
  const rows = await db.listDownloadedModels();
  const row = rows.find((m) => isSameRepo(m.name, repoId));
  if (!row) throw new Error("Local model not found in database.");
  const exact = rows.find((m) => m.name === repoId);
  return {
    model: {
      _id: repoId,
      id: repoId,
      downloads: 0,
      likes: 0,
      gated: false,
      safetensors: { parameters: row.param_count ?? undefined },
    },
    card: exact?.model_card || row.model_card || null,
  };
}

const NO_FILES: HubFileEntry[] = [];

/**
 * The detail page's data. An installed model reads the database only. A Hub model loads in three
 * parts with their own status: the model record (its failure has no partial view, so the page
 * shows a retry), then the file tree and the README, which start once the record is in. A repo
 * the Hub does not know gets no file or README request.
 */
export function useHubModelData(repoId: string, isLocal = false) {
  const local = useAsyncData(isLocal ? repoId : null, loadLocalModel);
  const remote = useAsyncData(isLocal ? null : repoId, getHubModel);
  const partsKey = !isLocal && remote.data ? repoId : null;
  const files = useAsyncData(partsKey, listHubModelFiles);
  const readme = useAsyncData(partsKey, fetchHubModelReadme);

  const ggufGroups = useMemo(
    () => groupGGUFFiles(convertToGGUFFiles(files.data ?? NO_FILES)),
    [files.data],
  );

  const load = isLocal ? local : remote;
  return {
    model: isLocal ? (local.data?.model ?? null) : remote.data,
    localCard: local.data?.card ?? null,
    /** Status, error and retry of the model record, the part the whole page depends on. */
    status: load.status,
    error: load.error,
    retry: load.retry,
    files,
    readme,
    ggufGroups,
  };
}

/** Precisions of this repo that are already imported into the local DB. */
export function useDownloadedPrecisions(repoId: string) {
  const [downloadedPrecisions, setDownloadedPrecisions] = useState<Set<string>>(new Set());
  // The local model list changes when a download finishes its import, so the set is read again then.
  const localModels = useModelStore((s) => s.models);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the model list is the trigger, the rows are read from the DB
  useEffect(() => {
    let cancelled = false;
    if (!repoId) {
      setDownloadedPrecisions(new Set());
      return;
    }
    db.listDownloadedModels()
      .then((models) => {
        if (cancelled) return;
        const precisions = new Set(
          models
            .filter((m) => isSameRepo(m.name, repoId))
            .map((m) => m.precision ?? "")
            .filter((p) => p),
        );
        setDownloadedPrecisions(precisions);
      })
      .catch(() => {
        if (!cancelled) setDownloadedPrecisions(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, localModels]);

  return downloadedPrecisions;
}

/** The row stored when the installed model was downloaded (null for other models or when none matches). */
export function useStoredModelRow(repoId: string, enabled: boolean): db.DbDownloadedModel | null {
  const [row, setRow] = useState<db.DbDownloadedModel | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !repoId) {
      setRow(null);
      return;
    }
    db.listDownloadedModels()
      .then((models) => {
        if (cancelled) return;
        setRow(models.find((m) => isSameRepo(m.name, repoId)) ?? null);
      })
      .catch(() => {
        if (!cancelled) setRow(null);
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, enabled]);

  return row;
}

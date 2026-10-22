import { useEffect, useMemo, useState } from "react";
import * as db from "../../services/database";
import {
  fetchHubModelReadme,
  getHubModel,
  type HubFileEntry,
  type HubModel,
  listHubModelFiles,
} from "../../services/hubApi";
import { convertToGGUFFiles, groupGGUFFiles } from "../../services/hubModels";
import type { SystemMemoryInfo } from "../../services/system";
import { getSystemMemory } from "../../services/system";

/** Loads the model, its file listing, README or stored model card, and derives GGUF groups. */
export function useHubModelData(repoId: string, isLocal = false) {
  const [model, setModel] = useState<HubModel | null>(null);
  const [files, setFiles] = useState<HubFileEntry[]>([]);
  const [readme, setReadme] = useState<string | null>(null);
  const [localCard, setLocalCard] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ggufGroups = useMemo(() => groupGGUFFiles(convertToGGUFFiles(files)), [files]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setModel(null);
    setFiles([]);
    setReadme(null);
    (async () => {
      try {
        if (isLocal) {
          // Local model: build synthetic HubModel from DB so UI works
          const models = await db.listDownloadedModels();
          const row = models.find((m) => m.name === repoId || repoId.includes(m.name));
          if (row) {
            setModel({
              _id: repoId,
              id: repoId,
              downloads: 0,
              likes: 0,
              gated: false,
              safetensors: { parameters: row.param_count ?? undefined },
            });
            if (row.model_card) setLocalCard(row.model_card);
            else setLocalCard(null);
          } else {
            setError("Local model not found in database.");
          }
          setLoading(false);
          return;
        }
        const m = await getHubModel(repoId);
        if (cancelled) return;
        setModel(m);
        listHubModelFiles(repoId)
          .then((f) => !cancelled && setFiles(f))
          .catch(() => undefined);
        fetchHubModelReadme(repoId)
          .then((r) => !cancelled && setReadme(r))
          .catch(() => undefined);
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repoId, isLocal]);

  // For local models, fetch stored model card from DB
  useEffect(() => {
    if (!isLocal || !repoId) return;
    db.listDownloadedModels()
      .then((models) => {
        const row = models.find((m) => m.name === repoId);
        if (row?.model_card) setLocalCard(row.model_card);
      })
      .catch(() => setLocalCard(null));
  }, [isLocal, repoId]);

  return { model, files, readme, localCard, ggufGroups, loading, error, setError };
}

/** Precisions of this repo that are already imported into the local DB. */
export function useDownloadedPrecisions(repoId: string) {
  const [downloadedPrecisions, setDownloadedPrecisions] = useState<Set<string>>(new Set());

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
            .filter((m) => m.name === repoId || repoId.includes(m.name))
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
  }, [repoId]);

  return downloadedPrecisions;
}

/** System memory snapshot, loaded once for RAM-fit estimates. */
export function useSystemMemory() {
  const [systemMemory, setSystemMemory] = useState<SystemMemoryInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSystemMemory()
      .then((mem) => !cancelled && setSystemMemory(mem))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return systemMemory;
}

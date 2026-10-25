import { useCallback, useEffect, useState } from "react";
import { useTauriEvent } from "../../hooks";
import { serverBaseUrl } from "../../services/geniex";
import { reloadModel } from "../../services/modelLoad";
import {
  cancelCapabilityScan,
  loadModelCapabilities,
  scanModelCapabilities,
} from "../../services/models";
import { useModelStore } from "../../stores/modelStore";
import type { CapabilityEntry, CapabilityScanProgress } from "../../types";
import { SCAN_RECIPE } from "../../utils/modelSettings";
import { toast } from "../../utils/toast";

/** Stored results, kept with the model they belong to. */
interface StoredResults {
  model: string;
  entries: CapabilityEntry[];
}

/** "loading" is the reload before a Reload & Scan. "scanning" is the test run. */
export type ScanPhase = "loading" | "scanning";

/** A run in progress, the model it is for and the setting it is on. */
interface ActiveScan {
  model: string;
  phase: ScanPhase;
  progress: CapabilityScanProgress | null;
}

/** A scan error, kept with the model it was for. */
interface ScanError {
  model: string;
  message: string;
}

export interface CapabilityScanState {
  /** Stored results for the model. Empty when there are none. */
  entries: CapabilityEntry[];
  /** Phase of a run of this model, or null when none is running for it. */
  phase: ScanPhase | null;
  /** True while a run of any model is in progress. The backend runs one scan at a time. */
  busy: boolean;
  /** Progress of the scanning phase. */
  progress: CapabilityScanProgress | null;
  error: string | null;
  /** Scan the model, which must already be loaded. Leaves it loaded. */
  start: () => Promise<void>;
  /** Reload the model with the scan's fixed setup, then scan it. Leaves it loaded. */
  reloadAndScan: () => Promise<void>;
  /** Stops a running scan. Only meaningful in the scanning phase. */
  cancel: () => void;
}

/**
 * Settings scan for one model: its stored results, a scan against the loaded model, and Reload &
 * Scan. Results, progress and errors are tied to the model they belong to, so switching models does
 * not show another model's state.
 */
export function useCapabilityScan(modelKey: string): CapabilityScanState {
  const [stored, setStored] = useState<StoredResults | null>(null);
  const [active, setActive] = useState<ActiveScan | null>(null);
  const [error, setError] = useState<ScanError | null>(null);

  useEffect(() => {
    if (!modelKey) return;
    let current = true;
    loadModelCapabilities(modelKey)
      .then((entries) => {
        if (current) setStored({ model: modelKey, entries });
      })
      .catch(() => {
        if (current) setStored({ model: modelKey, entries: [] });
      });
    return () => {
      current = false;
    };
  }, [modelKey]);

  useTauriEvent<CapabilityScanProgress>("capability-scan-progress", (progress) => {
    setActive((prev) => (prev && prev.model === progress.model ? { ...prev, progress } : prev));
  });

  /** Runs one scan on the loaded model and stores its results. Rejects on failure. */
  const scanLoaded = useCallback(async (): Promise<void> => {
    // The fixed scan recipe, not the saved settings: every model is probed the same way.
    const baseUrl = serverBaseUrl(useModelStore.getState().serverPort);
    const result = await scanModelCapabilities(modelKey, SCAN_RECIPE, baseUrl);
    setStored({ model: modelKey, entries: result.entries });
    if (result.cancelled) {
      toast.info("Scan cancelled", "Settings tested so far were saved.");
    } else {
      toast.success("Scan finished", "Results are saved for this model.");
    }
  }, [modelKey]);

  /** Runs a scan, optionally reloading the model first. Failures are kept for the model. */
  const run = useCallback(
    async (reload: boolean) => {
      setError(null);
      setActive({ model: modelKey, phase: reload ? "loading" : "scanning", progress: null });
      try {
        if (reload) {
          // Reload stops the server, which unloads every model, then loads this one.
          await reloadModel(modelKey, SCAN_RECIPE);
          setActive({ model: modelKey, phase: "scanning", progress: null });
        }
        await scanLoaded();
      } catch (err) {
        setError({ model: modelKey, message: String(err) });
      } finally {
        setActive(null);
      }
    },
    [modelKey, scanLoaded],
  );

  const start = useCallback(() => run(false), [run]);
  const reloadAndScan = useCallback(() => run(true), [run]);

  const cancel = useCallback(() => {
    cancelCapabilityScan().catch((err: unknown) => {
      setError({ model: modelKey, message: String(err) });
    });
  }, [modelKey]);

  const current = active?.model === modelKey ? active : null;
  return {
    entries: stored?.model === modelKey ? stored.entries : [],
    phase: current?.phase ?? null,
    busy: active !== null,
    progress: current?.phase === "scanning" ? current.progress : null,
    error: error?.model === modelKey ? error.message : null,
    start,
    reloadAndScan,
    cancel,
  };
}

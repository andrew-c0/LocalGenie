import { useEffect, useState } from "react";
import * as db from "../services/database";
import { useModelStore } from "../stores/modelStore";
import { contextWindowFor, modelSettingsKey } from "../utils/modelSettings";

/**
 * The context window in tokens for the loaded model: the saved setting, else the model's own (stored with
 * the downloaded-model row). Null when neither is known. Re-read when the model, the list or the server
 * changes, since a reload can change the setting.
 */
export function useContextWindow(): number | null {
  const activeModelId = useModelStore((s) => s.activeModelId);
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);
  const [contextWindow, setContextWindow] = useState<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: models and server status are the triggers, the values are read from the DB
  useEffect(() => {
    if (!activeModelId) {
      setContextWindow(null);
      return;
    }
    const key = modelSettingsKey(activeModelId);
    let cancelled = false;
    Promise.all([db.loadModelSettings(key), db.loadNativeContext(key)])
      .then(([saved, native]) => {
        if (!cancelled) setContextWindow(contextWindowFor(saved, native));
      })
      .catch(() => {
        if (!cancelled) setContextWindow(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeModelId, models, serverStatus]);

  return contextWindow;
}

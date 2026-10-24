import { useEffect, useState } from "react";
import * as db from "../../../services/database";
import { useModelStore } from "../../../stores/modelStore";
import {
  DEFAULT_CONTEXT_WINDOW,
  engineOf,
  modelSettingsKey,
  resolveLoadParams,
} from "../../../utils/modelSettings";

interface Resolved {
  model: string;
  nCtx: number;
}

/**
 * Context window of the model shown in the usage card. A model loaded by this app session uses the
 * window recorded at load time. A model loaded before this session has no record, so the window is
 * worked out the same way a load would: saved setting, then the native window, then the default.
 * Returns null while that is being read, or when no model is active.
 */
export function useContextWindow(modelName: string | null): number | null {
  const loadedContext = useModelStore((s) => s.loadedContext);
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (!modelName || loadedContext !== null) return;
    let active = true;
    const key = modelSettingsKey(modelName);
    Promise.all([
      db.loadModelSettings(key).catch(() => ({})),
      db.loadNativeContext(key).catch(() => null),
    ]).then(([saved, nativeContext]) => {
      const state = useModelStore.getState();
      const model = state.models.find((m) => m.name === modelName);
      const load = resolveLoadParams(saved, engineOf(model), state.compute, nativeContext);
      if (active) setResolved({ model: modelName, nCtx: load.nctx ?? DEFAULT_CONTEXT_WINDOW });
    });
    return () => {
      active = false;
    };
  }, [modelName, loadedContext]);

  if (loadedContext !== null) return loadedContext;
  return resolved && resolved.model === modelName ? resolved.nCtx : null;
}

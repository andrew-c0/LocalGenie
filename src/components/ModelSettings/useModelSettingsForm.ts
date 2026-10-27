import { useCallback, useEffect, useState } from "react";
import * as db from "../../services/database";
import { reloadModel } from "../../services/modelLoad";
import { defaultSettings } from "../../stores/modelStore";
import type { StoredModelSettings } from "../../types";
import { withSystemBlocks } from "../../utils/systemPrompt";
import { toast } from "../../utils/toast";

/** A save action in progress. Null when idle. */
export type SaveAction = "save" | "saveAndLoad";

export interface ModelSettingsForm {
  settings: StoredModelSettings;
  update: <K extends keyof StoredModelSettings>(key: K, value: StoredModelSettings[K]) => void;
  /** The model's own context length, or null when it is not known. */
  nativeContext: number | null;
  pending: SaveAction | null;
  /** Deletes the model's saved settings and puts the form back to the defaults. */
  reset: () => Promise<void>;
  /** Writes the settings and tells the user to reload the model to use them. */
  save: () => Promise<void>;
  /** Writes the settings, then reloads the model with them. Does not reload when the write failed. */
  saveAndLoad: () => Promise<void>;
}

/**
 * Edit state for one model's settings: the saved values, the edits and the save actions.
 *
 * @param model the model name as shown (used to reload it)
 * @param settingsKey the model's settings key, or "" when no model is selected
 */
export function useModelSettingsForm(model: string, settingsKey: string): ModelSettingsForm {
  const [settings, setSettings] = useState<StoredModelSettings>({ ...defaultSettings });
  const [nativeContext, setNativeContext] = useState<number | null>(null);
  const [pending, setPending] = useState<SaveAction | null>(null);

  // Load saved settings and the model's own context window whenever the selected model changes.
  useEffect(() => {
    if (!settingsKey) return;
    db.loadModelSettings(settingsKey)
      .then((saved) => setSettings(withSystemBlocks({ ...defaultSettings, ...saved })))
      .catch(() => {});
    db.loadNativeContext(settingsKey)
      .then(setNativeContext)
      .catch(() => setNativeContext(null));
  }, [settingsKey]);

  const update = useCallback(
    <K extends keyof StoredModelSettings>(key: K, value: StoredModelSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  /** Deletes the model's saved settings and puts the form back to the defaults. */
  const reset = useCallback(async () => {
    if (!settingsKey || pending) return;
    try {
      // An empty object removes every saved key for the model (see `model_settings::save`).
      await db.saveModelSettings(settingsKey, {});
      setSettings({ ...defaultSettings });
      toast.success("Model settings reset", "The saved settings were deleted.");
    } catch (err) {
      toast.error("Model settings not reset", String(err));
    }
  }, [settingsKey, pending]);

  /** Writes the settings. Returns false when the write failed, after showing the error. */
  const write = useCallback(async (): Promise<boolean> => {
    try {
      await db.saveModelSettings(settingsKey, settings);
      return true;
    } catch (err) {
      toast.error("Model settings not saved", String(err));
      return false;
    }
  }, [settingsKey, settings]);

  const save = useCallback(async () => {
    if (!settingsKey || pending) return;
    setPending("save");
    try {
      if (await write()) {
        toast.success("Model settings saved", "To use the settings, reload the model.");
      }
    } finally {
      setPending(null);
    }
  }, [settingsKey, pending, write]);

  const saveAndLoad = useCallback(async () => {
    if (!settingsKey || pending) return;
    setPending("saveAndLoad");
    try {
      if (!(await write())) return;
      try {
        // Load parameters only apply at load time. Reload reads the settings just written.
        await reloadModel(model);
        toast.success("Model reloaded", "It now uses the saved settings.");
      } catch (err) {
        toast.error("Model failed to reload", String(err));
      }
    } finally {
      setPending(null);
    }
  }, [model, settingsKey, pending, write]);

  return { settings, update, nativeContext, pending, reset, save, saveAndLoad };
}

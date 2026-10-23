import { sameModel } from "./modelSettings";

/** Actions under the model settings form. */
export type SettingsAction = "save" | "saveAndLoad" | "scan" | "reloadAndScan" | "cancelScan";

export interface SettingsButton {
  action: SettingsAction;
  label: string;
  appearance: "primary" | "secondary";
}

export interface SettingsButtonState {
  /** The model the server has loaded, or null when none is loaded. */
  loadedModel: string | null;
  /** The model shown in the settings. */
  selectedModel: string;
  /** A scan of the selected model is running. Only Cancel is offered then. */
  scanning: boolean;
}

/**
 * Buttons under the settings form.
 *
 * - Scanning: Cancel scan only.
 * - Save: always. Save & Load is offered only when no model is loaded.
 * - Scan: when the selected model is the loaded one. Otherwise Reload & Scan, which reloads the
 *   selected model with its saved settings and then scans it.
 */
export function settingsButtons({
  loadedModel,
  selectedModel,
  scanning,
}: SettingsButtonState): SettingsButton[] {
  if (scanning) {
    return [{ action: "cancelScan", label: "Cancel scan", appearance: "secondary" }];
  }
  const save: SettingsButton = { action: "save", label: "Save", appearance: "primary" };
  const scanButton: SettingsButton =
    loadedModel !== null && sameModel(loadedModel, selectedModel)
      ? { action: "scan", label: "Scan", appearance: "secondary" }
      : { action: "reloadAndScan", label: "Reload & Scan", appearance: "secondary" };
  if (loadedModel === null) {
    return [
      save,
      { action: "saveAndLoad", label: "Save & Load", appearance: "secondary" },
      scanButton,
    ];
  }
  return [save, scanButton];
}

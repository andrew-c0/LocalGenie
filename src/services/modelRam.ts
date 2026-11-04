import { invoke } from "@tauri-apps/api/core";
import { type StoredRam, storedRamOfRow } from "../utils/modelRam";
import { modelSettingsKey } from "../utils/modelSettings";
import * as db from "./database";

/**
 * Computes and stores the RAM of every downloaded model that has none yet (models downloaded before
 * the figures were kept). Safe to call at every start: it only touches rows without a figure.
 */
export async function backfillModelRam(): Promise<void> {
  await invoke("backfill_model_ram");
}

/**
 * The RAM stored with each downloaded model, keyed by the model's settings key. A model without a
 * stored figure (not computed yet, or its files could not be read) has no entry.
 */
export async function loadStoredRam(): Promise<Record<string, StoredRam>> {
  const rows = await db.listDownloadedModels();
  const ram: Record<string, StoredRam> = {};
  for (const row of rows) {
    const stored = storedRamOfRow(row);
    if (stored) ram[modelSettingsKey(row.name)] = stored;
  }
  return ram;
}

import * as geniex from "../services/geniex";
import { useModelStore } from "../stores/modelStore";

/**
 * Reads the device chipset from the GenieX CLI host probe. Null when the CLI is missing or the read
 * fails. Best-effort: it never throws.
 */
export async function readChipset(): Promise<string | null> {
  try {
    return await geniex.configGet("chipset");
  } catch {
    return null;
  }
}

/**
 * Re-reads the device chipset after the GenieX runtime state changes. Without the CLI there is no
 * chipset, so it is cleared. While the CLI state is unread the current value is kept.
 */
export async function refreshChipset(): Promise<void> {
  const { cliInstalled, setChipset } = useModelStore.getState();
  if (cliInstalled === false) {
    setChipset(null);
    return;
  }
  if (cliInstalled === true) {
    setChipset(await readChipset());
  }
}

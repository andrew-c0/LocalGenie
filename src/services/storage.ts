import { invoke } from "@tauri-apps/api/core";
import type { StorageUsage } from "../types";

/** Measure the places LocalGenie keeps data on this device, with the uninstall policy of each. */
export async function getStorageUsage(): Promise<StorageUsage> {
  return invoke("storage_usage");
}

/** Open the folder of one storage item (by its id) in the file explorer. */
export async function openStorageFolder(id: string): Promise<void> {
  return invoke("storage_open_folder", { id });
}

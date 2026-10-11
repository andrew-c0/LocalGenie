import { invoke } from "@tauri-apps/api/core";

/** Host memory figures reported by the Rust `get_system_memory` command. */
export interface SystemMemoryInfo {
  totalBytes: number;
  availableBytes: number;
}

/** Read total/available System RAM (used by the precision fit calculator). */
export async function getSystemMemory(): Promise<SystemMemoryInfo> {
  return invoke("get_system_memory");
}

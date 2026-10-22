import { invoke } from "@tauri-apps/api/core";
import type { PlatformInfo } from "../types";

/** Host memory figures reported by the Rust `get_system_memory` command. */
export interface SystemMemoryInfo {
  totalBytes: number;
  availableBytes: number;
}

/** Read total/available System RAM (used by the precision fit calculator). */
export async function getSystemMemory(): Promise<SystemMemoryInfo> {
  return invoke("get_system_memory");
}

let platformInfo: Promise<PlatformInfo> | null = null;

/** OS, architecture and RAM. Read once per session and then reused. */
export function getPlatformInfo(): Promise<PlatformInfo> {
  if (!platformInfo) {
    platformInfo = invoke<PlatformInfo>("get_platform_info").catch((err: unknown) => {
      platformInfo = null;
      throw err;
    });
  }
  return platformInfo;
}

/** Open a file dialog for `.txt` and `.md` files. Resolves to the path, or null when cancelled. */
export async function pickTextFile(): Promise<string | null> {
  return invoke("pick_text_file");
}

/** Read a `.txt` or `.md` file as text. Rejects when the file cannot be used. */
export async function readTextFile(path: string): Promise<string> {
  return invoke("read_text_file", { path });
}

/** Whether a file is still present at this path. */
export async function fileExists(path: string): Promise<boolean> {
  return invoke("file_exists", { path });
}

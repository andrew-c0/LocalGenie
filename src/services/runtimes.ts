import { invoke } from "@tauri-apps/api/core";
import type { RuntimeInfo, RuntimeUpdateInfo } from "../types";

/** Event carrying `RuntimeInstallProgress` while a runtime is installed or updated. */
export const RUNTIME_PROGRESS_EVENT = "runtime-install-progress";

/** Every runtime the app knows about, with its installed version when present. */
export async function listRuntimes(): Promise<RuntimeInfo[]> {
  return invoke("runtime_list");
}

/** Installed and latest release of one runtime. Reads GitHub, so call it only when the view opens. */
export async function checkRuntimeUpdate(id: string): Promise<RuntimeUpdateInfo> {
  return invoke("runtime_check_update", { id });
}

/** Install a runtime at `version`, or at the latest release when omitted. Resolves to the installed version. */
export async function installRuntime(id: string, version?: string): Promise<string> {
  return invoke("runtime_install", { id, version });
}

export async function uninstallRuntime(id: string): Promise<void> {
  return invoke("runtime_uninstall", { id });
}

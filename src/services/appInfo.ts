import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
import type { AppVersions } from "../types";

/** The app's name, version and Tauri runtime version. Reads the bundled config, so no backend command is needed. */
export async function getAppVersions(): Promise<AppVersions> {
  const [name, version, tauriVersion] = await Promise.all([
    getName(),
    getVersion(),
    getTauriVersion(),
  ]);
  return { name, version, tauriVersion };
}

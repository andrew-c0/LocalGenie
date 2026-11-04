import type { AppInfo, RuntimeInfo } from "../types";

/** The note at the top of the About page. */
export const ABOUT_NOTE =
  "LocalGenie is a desktop interface for the GenieX CLI. Models and chats stay on this device.";

export const NOT_INSTALLED = "Not installed";

export const SOURCE_URL = "https://github.com/andrew-c0/LocalGenie";

/** The licence sentence of the About page. */
export const LICENCE_TEXT = "MIT licence, copyright 2026 andrew-c0.";

/**
 * One line about the app: its version, the Tauri version, the platform with its architecture and the
 * build mode. Null until the app info is read.
 */
export function appSummary(info: AppInfo | null, buildMode: string): string | null {
  if (!info) return null;
  const platform = info.platform.osVersion || info.platform.os;
  return [
    `Version ${info.versions.version}`,
    `Tauri ${info.versions.tauriVersion}`,
    `${platform} (${info.platform.arch})`,
    `${buildMode} build`,
  ].join(" · ");
}

/** A runtime on the About page: its name, installed version and the page of its source code. */
export interface RuntimeSource {
  id: string;
  name: string;
  /** The installed version, or "Not installed". */
  version: string;
  /** The runtime's GitHub repository, from its release source. */
  url: string;
}

/** One entry per runtime, in the registry's order. Empty until the list is read. */
export function runtimeSources(runtimes: RuntimeInfo[] | null): RuntimeSource[] {
  return (runtimes ?? []).map((runtime) => ({
    id: runtime.id,
    name: runtime.displayName,
    version: runtime.installedVersion ?? NOT_INSTALLED,
    url: `https://github.com/${runtime.repo}`,
  }));
}

import {
  parseAllowedFolders,
  parseToolState,
  serializeAllowedFolders,
  TOOL_ALLOWED_FOLDERS_KEY,
  type ToolState,
  toolStateKey,
} from "../utils/toolAccess";
import {
  parseSourceIds,
  serializeSourceIds,
  WEB_SEARCH_SOURCES_KEY,
} from "../utils/webSearchSources";
import * as db from "./database";

/**
 * The saved state of each named tool. A tool with nothing saved, or an invalid value, is off. A read
 * that fails rejects, so the caller does not treat a broken read as "all off".
 */
export async function loadToolStates(names: string[]): Promise<Record<string, ToolState>> {
  const entries = await Promise.all(
    names.map(async (name) => {
      const raw = await db.getPreference<string>(toolStateKey(name));
      return [name, parseToolState(raw)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** Saves one tool's state. */
export async function saveToolState(name: string, state: ToolState): Promise<void> {
  await db.setPreference(toolStateKey(name), state, "string");
}

/** The saved list of folders the file tools may read. Empty when nothing is saved. */
export async function loadAllowedFolders(): Promise<string[]> {
  const raw = await db.getPreference<string>(TOOL_ALLOWED_FOLDERS_KEY);
  return parseAllowedFolders(raw);
}

/** Saves the whole folder list. The list is stored as JSON text inside the preference. */
export async function saveAllowedFolders(folders: string[]): Promise<void> {
  await db.setPreference(TOOL_ALLOWED_FOLDERS_KEY, serializeAllowedFolders(folders), "string");
}

/** The saved list of enabled web search source ids. Empty when nothing is saved. */
export async function loadSearchSourceIds(): Promise<string[]> {
  const raw = await db.getPreference<string>(WEB_SEARCH_SOURCES_KEY);
  return parseSourceIds(raw);
}

/** Saves the whole list of enabled search source ids, as JSON text inside the preference. */
export async function saveSearchSourceIds(ids: string[]): Promise<void> {
  await db.setPreference(WEB_SEARCH_SOURCES_KEY, serializeSourceIds(ids), "string");
}

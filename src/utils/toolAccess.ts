/**
 * Pure rules for the tool settings: the saved states, the list of folders the file tools may read,
 * and what a tool does in a chat. No state and no I/O here; the store and the Settings page use these.
 */

/** The user's choice for one tool in Settings > Tools. */
export type ToolState = "off" | "ask" | "on";

/** What a tool call does once the model asks for it: run it, ask the user first, or leave the tool out. */
export type ToolAccess = "run" | "ask" | "skip";

export const TOOL_STATES: readonly ToolState[] = ["off", "ask", "on"];

export const TOOL_STATE_LABEL: Record<ToolState, string> = {
  off: "Off",
  ask: "Request approval",
  on: "On",
};

/** One line under the choice: what the selected state means for models. */
export const TOOL_STATE_HELP: Record<ToolState, string> = {
  off: "Not offered to models. A model cannot use this tool.",
  ask: "Offered to models. You approve each use before it runs.",
  on: "Offered to models. It runs without asking.",
};

/** The preference key of one tool's saved state. */
export function toolStateKey(name: string): string {
  return `tool_state_${name}`;
}

/** The preference key of the shared list of folders the file tools may read. */
export const TOOL_ALLOWED_FOLDERS_KEY = "tool_allowed_folders";

/** A saved state. Anything but "ask" or "on" reads as off, so a bad value never turns a tool on. */
export function parseToolState(raw: unknown): ToolState {
  if (raw === "ask" || raw === "on") return raw;
  return "off";
}

const DRIVE_ROOT = /^[A-Za-z]:$/;
const TRAILING_SEPARATORS = /[\\/]+$/;

/** Trims a folder path and drops trailing separators, keeping a root (`C:\`, `/`) whole. */
export function normalizeFolderPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "") return "";
  const stripped = trimmed.replace(TRAILING_SEPARATORS, "");
  if (stripped === "") return trimmed.charAt(0);
  if (DRIVE_ROOT.test(stripped)) return `${stripped}\\`;
  return stripped;
}

/** True for a path the file tools can use: a drive path (`C:\...`), a network share (`\\server\...`) or a POSIX path (`/...`). */
export function isAbsoluteFolderPath(path: string): boolean {
  const folder = normalizeFolderPath(path);
  return /^[A-Za-z]:[\\/]/.test(folder) || /^\\\\[^\\/]/.test(folder) || folder.startsWith("/");
}

/** Windows paths compare without case and with either separator. Other paths compare as they are. */
function isWindowsStyle(folder: string): boolean {
  return /^[A-Za-z]:/.test(folder) || folder.startsWith("\\\\") || folder.includes("\\");
}

/** The form two folder paths are compared in: the same folder gives the same key. */
function folderKey(path: string): string {
  const folder = normalizeFolderPath(path);
  return isWindowsStyle(folder) ? folder.replace(/\//g, "\\").toLowerCase() : folder;
}

/**
 * Adds an absolute folder to the list. Returns the same list when nothing is added: a blank or
 * relative path, or a folder already in the list (compared without case on Windows paths).
 */
export function addAllowedFolder(list: string[], path: string): string[] {
  const folder = normalizeFolderPath(path);
  if (!isAbsoluteFolderPath(folder)) return list;
  if (list.some((item) => folderKey(item) === folderKey(folder))) return list;
  return [...list, folder];
}

/** The list without the given folder. Compared the same way `addAllowedFolder` compares. */
export function removeAllowedFolder(list: string[], path: string): string[] {
  const key = folderKey(path);
  return list.filter((item) => folderKey(item) !== key);
}

/** Why a typed folder cannot be added yet. Null when it can, or when nothing is typed. */
export type FolderProblem = "relative" | "duplicate";

export function folderDraftProblem(list: string[], draft: string): FolderProblem | null {
  const folder = normalizeFolderPath(draft);
  if (folder === "") return null;
  if (!isAbsoluteFolderPath(folder)) return "relative";
  if (list.some((item) => folderKey(item) === folderKey(folder))) return "duplicate";
  return null;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * The saved folder list. Accepts the stored JSON text (or the parsed array). Entries that are not
 * absolute strings are dropped and duplicates removed; anything unreadable reads as no folders.
 */
export function parseAllowedFolders(raw: unknown): string[] {
  const value = typeof raw === "string" ? parseJson(raw) : raw;
  if (!Array.isArray(value)) return [];
  const items: unknown[] = value;
  return items.reduce<string[]>((folders, item) => {
    if (typeof item === "string" && isAbsoluteFolderPath(item)) {
      return addAllowedFolder(folders, item);
    }
    return folders;
  }, []);
}

/** The folder list as the JSON text stored in the preference table. */
export function serializeAllowedFolders(list: string[]): string {
  return JSON.stringify(list);
}

/**
 * What a tool call does in a chat. Off leaves the tool out. On runs it. Request approval runs it
 * without asking once the chat has been granted this tool, and asks otherwise.
 */
export function toolAccess(state: ToolState, grantedForChat: boolean): ToolAccess {
  if (state === "on") return "run";
  if (state === "ask") return grantedForChat ? "run" : "ask";
  return "skip";
}

/** The names of the tools to offer a model: every tool whose state is not off. */
export function offeredToolNames(states: Record<string, ToolState>): string[] {
  return Object.entries(states)
    .filter(([, state]) => state !== "off")
    .map(([name]) => name);
}

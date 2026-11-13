import type { SearchSourceInfo, ToolApproval, ToolRisk, ToolStatus } from "../types";
import { formatDuration } from "./format";
import { mcpDisplayName } from "./mcpTools";
import { parseJsonObject } from "./toolRecords";

/** Human labels of the built-in tools. A tool not listed here shows its raw name. */
const TOOL_LABELS = new Map<string, string>([
  ["list_directory", "Listed folder"],
  ["read_text_file", "Read file"],
  ["read_image", "Look at images"],
  ["web_search", "Searched the web"],
  ["web_fetch", "Fetched page"],
]);

/** Argument keys that name what a call worked on, in the order they are preferred. */
const TARGET_KEYS = ["path", "query", "url"] as const;

/** Longest argument summary shown on the line. The details show the full arguments. */
export const TARGET_MAX_LENGTH = 80;

/**
 * The label of a tool line, from the tool's name. An MCP tool reads "<server> · <tool>"; `serverName`
 * is the server's name when the caller knows it, else the slug in the name is used.
 */
export function toolLabel(name: string, serverName?: string): string {
  return TOOL_LABELS.get(name) ?? mcpDisplayName(name, serverName) ?? name;
}

/** Cuts `text` to `max` characters, ending with an ellipsis when it is cut. */
export function truncateText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * A short line naming what a call worked on: the path, query or url the model passed, in that order.
 * Null when the arguments are not a JSON object or name none of them.
 */
export function toolTargetSummary(args: string, max = TARGET_MAX_LENGTH): string | null {
  const parsed = parseJsonObject(args);
  if (!parsed) return null;
  for (const key of TARGET_KEYS) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim() !== "") {
      return truncateText(value.trim(), max);
    }
  }
  return null;
}

/** The arguments pretty-printed for the details. Text that is not JSON is shown as it was sent. */
export function prettyArguments(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    return args;
  }
}

/** The status text of a tool line. `warning` marks a call that did not complete. */
export interface ToolStatusText {
  text: string;
  warning: boolean;
}

/** The status shown on a tool line: the duration for a call that ran, or why it did not complete. */
export function toolStatusText(status: ToolStatus, durationMs?: number): ToolStatusText {
  switch (status) {
    case "ok":
      return {
        text: durationMs === undefined ? "Done" : formatDuration(durationMs),
        warning: false,
      };
    case "error":
      return { text: "Failed", warning: true };
    case "denied":
      return { text: "Denied", warning: true };
    case "cancelled":
      return { text: "Stopped", warning: true };
  }
}

/** How a call was approved, as the details show it. */
export function approvalText(approval: ToolApproval): string {
  switch (approval) {
    case "auto":
      return "Automatic";
    case "once":
      return "Approved once";
    case "chat":
      return "Allowed for this chat";
  }
}

/** The line the approval dialog shows under an MCP tool's call: the server runs it, not the app. */
export function externalToolNote(serverName: string | undefined): string {
  const server = serverName ? `"${serverName}"` : "you added";
  return `This tool runs on the external server ${server}. What it returns comes from that server and is untrusted, like a web page.`;
}

const READ_NOTE = "This tool can read files in the folders you allowed.";
const FETCH_NOTE = "This tool will download this page from the internet.";
const NO_HOST_SEARCH_NOTE = "This tool will send your search to the sources you turned on.";

/**
 * The line the approval dialog shows under a call: what it reads or sends out. Web search names the
 * hosts it will contact: the chosen source's host when the call names one, else every turned-on source.
 * Null for a tool with nothing to add.
 */
export function approvalNote(
  toolName: string,
  risk: ToolRisk | undefined,
  args: string,
  activeSources: SearchSourceInfo[],
): string | null {
  if (toolName === "web_fetch") return FETCH_NOTE;
  if (toolName === "web_search") return searchNote(args, activeSources);
  if (risk === "read") return READ_NOTE;
  return null;
}

function searchNote(args: string, activeSources: SearchSourceInfo[]): string {
  const chosen = parseJsonObject(args)?.source;
  const named = activeSources.filter((source) => source.id === chosen);
  const targets = named.length > 0 ? named : activeSources;
  const hosts = [...new Set(targets.map((source) => source.host))];
  if (hosts.length === 0) return NO_HOST_SEARCH_NOTE;
  return `This tool will send your search to: ${hosts.join(", ")}.`;
}

import { invoke } from "@tauri-apps/api/core";
import type { SearchSourceInfo, ToolResult, ToolResultAttachment, ToolSpec } from "../types";

/** Every tool the registry knows, with its risk and source. The only wrapper of the tool commands. */
export async function listTools(): Promise<ToolSpec[]> {
  return invoke("tool_list");
}

/** Every web search source the backend knows, in its order. The source list is local; no network call. */
export async function listSearchSources(): Promise<SearchSourceInfo[]> {
  return invoke("web_search_sources");
}

/**
 * Run one tool call. `args` is the raw JSON string the model sent. `allowedFolders` limits the file
 * tools to the folders the user allowed; `enabledSearchSources` limits `web_search` to the sources the
 * user turned on (null when not given). A failed call comes back as `ok: false`, not as a rejection.
 */
export async function executeTool(
  name: string,
  args: string,
  allowedFolders: string[],
  enabledSearchSources: string[] | null = null,
): Promise<ToolResult> {
  const raw: RawToolResult = await invoke("tool_execute", {
    name,
    arguments: args,
    allowedFolders,
    enabledSearchSources,
  });
  return toToolResult(raw);
}

/** A result as the backend sends it. Its attachment is not checked yet. */
type RawToolResult = Omit<ToolResult, "attachment"> & { attachment?: unknown };

/** True for an attachment with the path, name and MIME type the chat needs to read the file again. */
function isToolResultAttachment(value: unknown): value is ToolResultAttachment {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    value.path !== "" &&
    "name" in value &&
    typeof value.name === "string" &&
    "mime" in value &&
    typeof value.mime === "string"
  );
}

/** The result as the app uses it. An attachment that is not a complete file reference is dropped. */
export function toToolResult(raw: RawToolResult): ToolResult {
  const { attachment, ...rest } = raw;
  return isToolResultAttachment(attachment) ? { ...rest, attachment } : rest;
}

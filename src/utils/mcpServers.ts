import type {
  McpServerConfig,
  McpServerInfo,
  McpStatus,
  McpTestResult,
  McpTransport,
} from "../types";
import { countLabel } from "./format";

/**
 * Pure rules for the MCP server form and list: the draft the form edits, its validation, the config it
 * saves, the command line it shows and the status text. No state and no I/O here.
 */

/** One name and value pair of the form: an environment variable or a header. `id` keeps React rows apart. */
export interface KeyValueRow {
  id: string;
  key: string;
  value: string;
}

/** What the server form holds while it is open. Arguments are typed one per line. */
export interface McpDraft {
  name: string;
  transport: McpTransport;
  command: string;
  argsText: string;
  /** The working folder for stdio. Empty means LocalGenie's folder. */
  cwd: string;
  env: KeyValueRow[];
  url: string;
  headers: KeyValueRow[];
}

/** One message per field that is wrong. A missing key means that field is fine. */
export interface McpDraftErrors {
  name?: string;
  command?: string;
  url?: string;
  env?: string;
  headers?: string;
}

/** The warning the form shows for a stdio server, which is a program. */
export const STDIO_WARNING =
  "A stdio server is a program. It runs with your permissions and can read or change anything you can. Add only programs you trust.";

/** Where the form says the stored values live. */
export const PLAIN_TEXT_NOTE =
  "Environment values and headers are stored as plain text on this computer. Do not add a secret you would not keep in a file.";

/** An empty form for a new server: a program, nothing typed yet. */
export function emptyDraft(): McpDraft {
  return {
    name: "",
    transport: "stdio",
    command: "",
    argsText: "",
    cwd: "",
    env: [],
    url: "",
    headers: [],
  };
}

/** Rows from a saved record, in the record's key order. */
export function rowsFromRecord(record: Record<string, string>, newId: () => string): KeyValueRow[] {
  return Object.entries(record).map(([key, value]) => ({ id: newId(), key, value }));
}

/** The record a list of rows saves. Rows with no name are left out. A repeated name keeps its last value. */
export function recordFromRows(rows: KeyValueRow[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key !== "") record[key] = row.value;
  }
  return record;
}

/** The form for an existing server, or an empty one for a new server (`config` null). */
export function draftFromConfig(config: McpServerConfig | null, newId: () => string): McpDraft {
  if (!config) return emptyDraft();
  return {
    name: config.name,
    transport: config.transport,
    command: config.command ?? "",
    argsText: config.args.join("\n"),
    cwd: config.cwd ?? "",
    env: rowsFromRecord(config.env, newId),
    url: config.url ?? "",
    headers: rowsFromRecord(config.headers, newId),
  };
}

/** Arguments typed one per line. Blank lines are left out; each line is trimmed. */
export function parseArgs(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** True for an address the app can connect to: an http or https URL with a host. */
export function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && url.host !== "";
  } catch {
    return false;
  }
}

/** The messages for the rows of one list: a value with no name, or a name used twice. Null when fine. */
function rowsProblem(rows: KeyValueRow[], noName: string, repeated: string): string | null {
  const named = rows.filter((row) => row.key.trim() !== "");
  if (rows.some((row) => row.key.trim() === "" && row.value.trim() !== "")) return noName;
  const keys = named.map((row) => row.key.trim());
  if (new Set(keys).size !== keys.length) return repeated;
  return null;
}

/**
 * What is wrong with the form. Only the fields of the chosen transport are checked: a program needs a
 * command, a server needs an address. An empty result means the form can be saved.
 */
export function validateDraft(draft: McpDraft): McpDraftErrors {
  const errors: McpDraftErrors = {};
  if (draft.name.trim() === "") errors.name = "Enter a name for this server.";

  if (draft.transport === "stdio") {
    if (draft.command.trim() === "") {
      errors.command = "Enter the program to run, for example npx.";
    }
    const env = rowsProblem(
      draft.env,
      "Each value needs a variable name.",
      "Two variables have the same name.",
    );
    if (env) errors.env = env;
    return errors;
  }

  if (draft.url.trim() === "") {
    errors.url = "Enter the server's address.";
  } else if (!isHttpUrl(draft.url)) {
    errors.url = "The address must start with http:// or https://.";
  }
  const headers = rowsProblem(
    draft.headers,
    "Each value needs a header name.",
    "Two headers have the same name.",
  );
  if (headers) errors.headers = headers;
  return errors;
}

/** True when the validation found at least one problem. */
export function hasDraftErrors(errors: McpDraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * The config the form saves, for a new server (`saved` null) or an edited one. Only the chosen
 * transport's fields are kept, so switching transport does not leave the other transport's settings
 * behind. The id, the connect-at-start switch and the slug come from the saved server. A new server
 * has no slug, so none is sent.
 */
export function configFromDraft(draft: McpDraft, saved: McpServerConfig | null): McpServerConfig {
  const base = {
    id: saved?.id ?? "",
    name: draft.name.trim(),
    transport: draft.transport,
    args: [],
    env: {},
    headers: {},
    cwd: null,
    enabled: saved?.enabled ?? true,
    ...(saved?.slug ? { slug: saved.slug } : {}),
  };
  if (draft.transport === "stdio") {
    return {
      ...base,
      command: draft.command.trim(),
      args: parseArgs(draft.argsText),
      env: recordFromRows(draft.env),
      cwd: draft.cwd.trim() || null,
    };
  }
  return { ...base, url: draft.url.trim(), headers: recordFromRows(draft.headers) };
}

/** An argument as the command line shows it: quoted when it has a space or a quote. */
function quoteArg(arg: string): string {
  if (arg === "") return '""';
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/**
 * The command line that will run, with the arguments in order and "in <folder>" after them when a
 * working folder is set. Empty when there is no command.
 */
export function commandLineOf(command: string, args: string[], folder = ""): string {
  const program = command.trim();
  if (program === "") return "";
  const line = [program, ...args.map(quoteArg)].join(" ");
  const place = folder.trim();
  return place === "" ? line : `${line} in ${place}`;
}

/** The status as the list shows it. */
export function statusLabel(status: McpStatus): string {
  switch (status) {
    case "stopped":
      return "Stopped";
    case "starting":
      return "Starting";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
  }
}

/** What the transport is, as a short label. */
export function transportLabel(transport: McpTransport): string {
  return transport === "stdio" ? "Program (stdio)" : "Web address (HTTP)";
}

/** "1 tool", "3 tools". */
export function toolCountLabel(count: number): string {
  return countLabel(count, "tool", "tools");
}

/** A server's status as the list needs it: a running server can be stopped, the others started. */
export function canStop(info: McpServerInfo): boolean {
  return info.status === "running" || info.status === "starting";
}

/** Only a running server can have its tools listed again. */
export function canRefresh(info: McpServerInfo): boolean {
  return info.status === "running";
}

/** How many lines and characters of a long text the collapsed view shows. */
export const ERROR_PREVIEW_LINES = 3;
export const ERROR_PREVIEW_CHARS = 280;

/**
 * The start of a long text (an error, which may carry a server's stderr) for the collapsed view. Keeps
 * the line breaks of the lines shown. `truncated` is true when some of the text is left out.
 */
export function previewText(
  text: string,
  maxLines = ERROR_PREVIEW_LINES,
  maxChars = ERROR_PREVIEW_CHARS,
): { preview: string; truncated: boolean } {
  const body = text.trimEnd();
  let preview = body.split(/\r?\n/).slice(0, maxLines).join("\n");
  if (preview.length > maxChars) preview = preview.slice(0, maxChars);
  return { preview, truncated: preview.length < body.length };
}

/** A tool description on one line: runs of spaces and new lines collapsed, long text cut with "…". */
export function shortDescription(description: string | undefined, maxChars = 140): string {
  const oneLine = (description ?? "").replace(/\s+/g, " ").trim();
  return oneLine.length > maxChars ? `${oneLine.slice(0, maxChars - 1).trimEnd()}…` : oneLine;
}

/** A finished connection test and the form values it ran with. */
export interface McpTestRun {
  draft: McpDraft;
  result: McpTestResult;
}

/**
 * The test result to show for the form now. Every edit makes a new draft object, so a result from an
 * earlier form is not shown. Null when there is no test, or the form has changed since it ran.
 */
export function testResultFor(run: McpTestRun | null, draft: McpDraft): McpTestResult | null {
  return run && run.draft === draft ? run.result : null;
}

/** Servers ordered by name, without case. Returns a new array. */
export function sortServersByName(servers: McpServerInfo[]): McpServerInfo[] {
  return [...servers].sort((a, b) =>
    a.config.name.localeCompare(b.config.name, undefined, { sensitivity: "base" }),
  );
}

/** A list of rows with the row `id` changed by `patch`. Other rows are returned as they were. */
export function changeRow(
  rows: KeyValueRow[],
  id: string,
  patch: Partial<Pick<KeyValueRow, "key" | "value">>,
): KeyValueRow[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

/** The list without the row `id`. */
export function removeRow(rows: KeyValueRow[], id: string): KeyValueRow[] {
  return rows.filter((row) => row.id !== id);
}

/** The list with an empty row added at the end. */
export function addRow(rows: KeyValueRow[], newId: () => string): KeyValueRow[] {
  return [...rows, { id: newId(), key: "", value: "" }];
}

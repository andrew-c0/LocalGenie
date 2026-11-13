import type { McpServerConfig, McpServerInfo, McpStatus, McpTransport } from "../types";
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
 * The config the form saves. Only the chosen transport's fields are kept, so switching transport does
 * not leave the other transport's settings behind. `id` is empty for a new server.
 */
export function configFromDraft(draft: McpDraft, id: string, enabled: boolean): McpServerConfig {
  const base = {
    id,
    name: draft.name.trim(),
    transport: draft.transport,
    args: [],
    env: {},
    headers: {},
    enabled,
  };
  if (draft.transport === "stdio") {
    return {
      ...base,
      command: draft.command.trim(),
      args: parseArgs(draft.argsText),
      env: recordFromRows(draft.env),
    };
  }
  return { ...base, url: draft.url.trim(), headers: recordFromRows(draft.headers) };
}

/** An argument as the command line shows it: quoted when it has a space or a quote. */
function quoteArg(arg: string): string {
  if (arg === "") return '""';
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/** The command line that will run, with the arguments in order. Empty when there is no command. */
export function commandLineOf(command: string, args: string[]): string {
  const program = command.trim();
  if (program === "") return "";
  return [program, ...args.map(quoteArg)].join(" ");
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

import type { StorageItem, StorageUninstallPolicy } from "../types";
import { formatBytes } from "./format";

/** Friendly text for one storage location, keyed by its backend id. */
export interface StorageText {
  label: string;
  description: string;
}

/** Text for each known backend id. An id not listed here shows its raw id and no description. */
const STORAGE_TEXT: Record<string, StorageText> = {
  database: {
    label: "Application database",
    description: "Chats, settings and benchmarks",
  },
  "playground-models": {
    label: "Playground models",
    description: "Image, upscaling and speech models for the Playground",
  },
  runtimes: {
    label: "Playground runtimes",
    description: "stable-diffusion.cpp and sherpa-onnx",
  },
  "benchmark-files": {
    label: "Benchmark files",
    description: "Files attached to benchmark prompts",
  },
  "geniex-models": {
    label: "GenieX models",
    description: "Chat and OCR models imported into GenieX",
  },
  "geniex-cli": {
    label: "GenieX CLI",
    description: "The GenieX CLI install",
  },
};

/**
 * The groups of the card, in display order. Each takes the rows whose uninstall policy matches.
 * A location with the "never" policy has no group: the card never shows it.
 */
export const STORAGE_GROUPS: ReadonlyArray<{ policy: StorageUninstallPolicy; title: string }> = [
  { policy: "always", title: "Removed when you uninstall" },
  { policy: "optional", title: "Removed only if you tick Delete the application data" },
];

/** One row of the card, ready to render. */
export interface StorageRowView {
  id: string;
  label: string;
  description: string;
  path: string;
  bytes: number;
  size: string;
}

/** A titled group of rows. Empty groups are left out. */
export interface StorageGroupView {
  policy: StorageUninstallPolicy;
  title: string;
  rows: StorageRowView[];
}

/** Everything the card shows: the non-empty groups and the total of the shown rows. */
export interface StorageView {
  groups: StorageGroupView[];
  totalBytes: number;
  total: string;
}

/** The friendly text for a backend id, or the raw id when the id is not known. */
export function storageText(id: string): StorageText {
  return STORAGE_TEXT[id] ?? { label: id, description: "" };
}

/** A row for a location that exists on disk. Locations that do not exist are dropped by `buildStorageView`. */
function toRow(item: StorageItem): StorageRowView {
  const text = storageText(item.id);
  return {
    id: item.id,
    label: text.label,
    description: text.description,
    path: item.path,
    bytes: item.bytes,
    size: formatBytes(item.bytes),
  };
}

/**
 * Turns the backend list into the card's view. Locations that do not exist are hidden, and so are
 * locations with the "never" policy, even if the backend still sends them. The total adds up the
 * rows shown.
 */
export function buildStorageView(items: StorageItem[]): StorageView {
  const shown = items.filter((item) => item.exists && item.uninstall !== "never");
  const groups = STORAGE_GROUPS.map((group) => ({
    policy: group.policy,
    title: group.title,
    rows: shown.filter((item) => item.uninstall === group.policy).map(toRow),
  })).filter((group) => group.rows.length > 0);
  const totalBytes = shown.reduce((sum, item) => sum + item.bytes, 0);
  return { groups, totalBytes, total: formatBytes(totalBytes) };
}

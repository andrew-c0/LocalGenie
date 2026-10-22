import { parseGGUFFilename } from "../utils/gguf";
import { type HubFileEntry, listHubModelFiles, precisionInfo } from "./hubApi";

/** One parsed GGUF file from a Hugging Face repo. */
export interface GGUFFile {
  filename: string;
  /** Precision / encoding, e.g. `Q4_0`, `Q4_K_M`, `F16`. */
  precision: string;
  sizeLabel: string | null;
  shard: string | null;
  /** Raw repo size in bytes, when the Hub tree entry provides it. */
  size?: number;
}

/** Grouped GGUF files: main file + its associated sidecars (mmproj, mtp, etc.) */
export interface GGUFGroup {
  main: GGUFFile;
  sidecars: GGUFFile[];
}

/** Convert Hub tree entries into parsed GGUF files, skipping anything that is not a GGUF. */
export function convertToGGUFFiles(entries: HubFileEntry[]): GGUFFile[] {
  const result: GGUFFile[] = [];
  for (const e of entries) {
    if (e.type !== "file") continue;
    const parsed = parseGGUFFilename(e.path);
    if (!parsed) continue;
    // Sidecars never need a precision; a main file without one cannot be labelled, so it is not offered.
    if (!parsed.sidecar && !parsed.encoding) continue;
    result.push({
      filename: e.path,
      precision: parsed.encoding ?? "unknown",
      sizeLabel: parsed.sizeLabel,
      shard: parsed.shard,
      size: e.size,
    });
  }
  return result;
}

/**
 * Group GGUF files: each non-sidecar file is its own group. A sidecar (mmproj, mtp)
 * is attached to every variant whose model name matches it, e.g.
 * `gemma-4-E4B-it-mmproj.gguf` → `gemma-4-E4B_q4_0-it.gguf`.
 */
export function groupGGUFFiles(files: GGUFFile[]): GGUFGroup[] {
  const mainFiles: GGUFFile[] = [];
  const sidecarFiles: GGUFFile[] = [];

  for (const f of files) {
    const parsed = parseGGUFFilename(f.filename);
    if (!parsed) continue;
    if (parsed.sidecar) {
      sidecarFiles.push(f);
    } else {
      mainFiles.push(f);
    }
  }

  // Sort main files by size, ascending
  mainFiles.sort((a, b) => (a.size ?? 0) - (b.size ?? 0));

  // Each main file gets its own group
  const groups: GGUFGroup[] = mainFiles.map((main) => ({ main, sidecars: [] }));

  for (const sidecar of sidecarFiles) {
    const stem = parseGGUFFilename(sidecar.filename)?.stem;
    if (!stem) continue;
    for (const g of groups) {
      if (parseGGUFFilename(g.main.filename)?.stem === stem) g.sidecars.push(sidecar);
    }
  }

  return groups;
}

/** Human label for a grouped GGUF variant, e.g. "Q4_0 — 4.2B". */
export function variantLabel(group: GGUFGroup): string {
  const info = precisionInfo(group.main.precision);
  return group.main.sizeLabel ? `${info.label} — ${group.main.sizeLabel}` : info.label;
}

/**
 * List the `.gguf` files in a Hugging Face model repo.
 * Falls back to an empty array when the repo has no GGUF files or the
 * tree request fails.
 */
export async function listGGUFFiles(repoId: string): Promise<GGUFFile[]> {
  try {
    return convertToGGUFFiles(await listHubModelFiles(repoId));
  } catch {
    return [];
  }
}

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
 * belongs to every variant whose model name matches it, e.g.
 * `gemma-4-E4B-it-mmproj.gguf` → `gemma-4-E4B_q4_0-it.gguf`. Each variant gets one sidecar
 * per kind (see `pickSidecars`).
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
  return mainFiles.map((main) => {
    const stem = parseGGUFFilename(main.filename)?.stem;
    const matching = sidecarFiles.filter((s) => parseGGUFFilename(s.filename)?.stem === stem);
    return { main, sidecars: pickSidecars(main, matching) };
  });
}

/**
 * One sidecar per kind (mmproj, mtp) for a variant: the one whose precision matches the variant,
 * else the smallest. A variant gets one projector, so GenieX never sees several to choose from.
 */
function pickSidecars(main: GGUFFile, candidates: GGUFFile[]): GGUFFile[] {
  const picked: GGUFFile[] = [];
  for (const kind of ["mmproj", "mtp"] as const) {
    const ofKind = candidates.filter((s) => parseGGUFFilename(s.filename)?.sidecar === kind);
    if (ofKind.length === 0) continue;
    const exact = ofKind.find((s) => s.precision.toLowerCase() === main.precision.toLowerCase());
    const smallest = [...ofKind].sort(
      (a, b) => (a.size ?? Number.MAX_SAFE_INTEGER) - (b.size ?? Number.MAX_SAFE_INTEGER),
    )[0];
    picked.push(exact ?? smallest);
  }
  return picked;
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

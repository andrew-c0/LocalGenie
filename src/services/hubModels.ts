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

/** Grouped GGUF files: main file + its projector (mmproj), if it has one. */
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
 * Group GGUF files: each non-sidecar file is its own group. A projector (mmproj) belongs to every
 * variant whose model name matches it, e.g. `gemma-4-E4B-it-mmproj.gguf` →
 * `gemma-4-E4B_q4_0-it.gguf`. Each variant gets one projector (see `pickSidecars`).
 */
export function groupGGUFFiles(files: GGUFFile[]): GGUFGroup[] {
  const mainFiles: GGUFFile[] = [];
  const sidecarFiles: GGUFFile[] = [];

  for (const f of files) {
    const parsed = parseGGUFFilename(f.filename);
    if (!parsed) continue;
    if (parsed.sidecar === "mmproj") {
      sidecarFiles.push(f);
    } else if (!parsed.sidecar) {
      mainFiles.push(f);
    }
    // MTP and DFlash files are not downloaded: GenieX does not import them with the model.
  }

  // Sort main files by size, ascending
  mainFiles.sort((a, b) => (a.size ?? 0) - (b.size ?? 0));

  // A projector without a model name (`mmproj-F16.gguf`) belongs to the repo's model when the repo
  // has one model. With several models in one repo it could belong to any of them, so it is not used.
  const singleModel = new Set(mainFiles.map((f) => parseGGUFFilename(f.filename)?.stem)).size === 1;

  // Each main file gets its own group
  return mainFiles.map((main) => {
    const stem = parseGGUFFilename(main.filename)?.stem;
    const own = sidecarFiles.filter((s) => parseGGUFFilename(s.filename)?.stem === stem);
    const generic = singleModel
      ? sidecarFiles.filter((s) => parseGGUFFilename(s.filename)?.stem === "")
      : [];
    return { main, sidecars: pickSidecars(main, own, generic) };
  });
}

/**
 * The projector for a variant: one file, the one whose precision matches the variant, else the
 * smallest. A variant gets one projector, so GenieX never sees several to choose from. A projector
 * named for the model wins over a generic one.
 */
function pickSidecars(main: GGUFFile, own: GGUFFile[], generic: GGUFFile[]): GGUFFile[] {
  const candidates = own.length > 0 ? own : generic;
  if (candidates.length === 0) return [];
  const exact = candidates.find((s) => s.precision.toLowerCase() === main.precision.toLowerCase());
  const smallest = [...candidates].sort(
    (a, b) => (a.size ?? Number.MAX_SAFE_INTEGER) - (b.size ?? Number.MAX_SAFE_INTEGER),
  )[0];
  return [exact ?? smallest];
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

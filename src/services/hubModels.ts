import { isGGUF, parseGGUFFilename } from "../utils/gguf";
import { type HubFileEntry, listHubModelFiles, precisionInfo } from "./hubApi";

/** One parsed GGUF file from a Hugging Face repo. */
export interface GGUFFile {
  filename: string;
  /** Precision / encoding, e.g. `Q4_0`, `Q4_K_M`, `F16`. */
  precision: string;
  sizeLabel: string | null;
  version: string;
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
    if (e.type !== "file" || !isGGUF(e.path)) continue;
    const parsed = parseGGUFFilename(e.path);
    if (!parsed) continue;
    result.push({
      filename: e.path,
      precision: parsed.encoding ?? "unknown",
      sizeLabel: parsed.sizeLabel,
      version: parsed.version,
      shard: parsed.shard,
      size: e.size,
    });
  }
  return result;
}

/** Group GGUF files: each non-sidecar file is its own group, sidecars are attached to their matching main file */
export function groupGGUFFiles(files: GGUFFile[]): GGUFGroup[] {
  const mainFiles: GGUFFile[] = [];
  const sidecarFiles: GGUFFile[] = [];

  /** Check if filename indicates a sidecar (mmproj/mtp) anywhere in the name */
  const isSidecarFilename = (filename: string): boolean => {
    const name = filename.replace(/\.gguf$/i, "");
    return name.includes("-mmproj-") || name.includes("-mtp-");
  };

  /** Normalize fineTune for matching by stripping -mmproj / -mtp segments */
  const normalizeFineTune = (fineTune: string | null): string => {
    if (!fineTune) return "";
    return fineTune.replace(/-mmproj/g, "").replace(/-mtp/g, "");
  };

  for (const f of files) {
    const parsed = parseGGUFFilename(f.filename);
    if (!parsed) continue;
    // Sidecar if: regex detected prefix sidecar, OR filename contains -mmproj-/-mtp- (middle pattern)
    if (parsed.sidecar !== null || isSidecarFilename(f.filename)) {
      sidecarFiles.push(f);
    } else {
      mainFiles.push(f);
    }
  }

  // Sort main files by size, ascending
  mainFiles.sort((a, b) => (a.size ?? 0) - (b.size ?? 0));

  // Each main file gets its own group
  const groups: GGUFGroup[] = mainFiles.map((main) => ({ main, sidecars: [] }));

  // Attach sidecars to the matching main file (same baseName + normalized fineTune + version + encoding)
  for (const sidecar of sidecarFiles) {
    const parsed = parseGGUFFilename(sidecar.filename);
    if (!parsed) continue;
    const match = groups.find((g) => {
      const mainParsed = parseGGUFFilename(g.main.filename);
      if (!mainParsed) return false;
      return (
        mainParsed.baseName === parsed.baseName &&
        normalizeFineTune(mainParsed.fineTune) === normalizeFineTune(parsed.fineTune) &&
        mainParsed.version === parsed.version &&
        mainParsed.encoding === parsed.encoding
      );
    });
    if (match) {
      match.sidecars.push(sidecar);
    }
  }

  return groups;
}

/** Human label for a grouped GGUF variant, e.g. "Q4_0 — 4.2B". */
export function variantLabel(group: GGUFGroup): string {
  const info = precisionInfo(group.main.precision);
  const parts = [info.label];
  if (group.main.sizeLabel) parts.push(group.main.sizeLabel);
  else if (group.main.version) parts.push(group.main.version);
  return parts.join(" — ");
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

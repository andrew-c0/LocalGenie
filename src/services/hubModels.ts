import { listHubModelFiles, type HubFileEntry } from "./hubApi";
import { isGGUF, parseGGUFFilename } from "../utils/gguf";

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

/**
 * List the `.gguf` files in a Hugging Face model repo.
 * Falls back to an empty array when the repo has no GGUF files or the
 * tree request fails.
 */
export async function listGGUFFiles(repoId: string): Promise<GGUFFile[]> {
  try {
    const entries = await listHubModelFiles(repoId);
    const gguf: GGUFFile[] = [];
    for (const e of entries) {
      if (e.type !== "file") continue;
      if (!isGGUF(e.path)) continue;
      const parsed = parseGGUFFilename(e.path);
      if (!parsed) continue;
      gguf.push({
        filename: e.path,
        precision: parsed.encoding ?? "unknown",
        sizeLabel: parsed.sizeLabel,
        version: parsed.version,
        shard: parsed.shard,
        size: e.size,
      });
    }
    return gguf;
  } catch {
    return [];
  }
}

/**
 * Parse the precision (encoding) out of a GGUF filename.
 * Returns `null` when the filename is not a valid GGUF file.
 */
export function parseGGUFPrecision(
  _repoId: string,
  filename: string,
): { precision: string; sizeLabel: string | null; version: string; shard: string | null } | null {
  const parsed = parseGGUFFilename(filename);
  if (!parsed) return null;
  return {
    precision: parsed.encoding ?? "unknown",
    sizeLabel: parsed.sizeLabel,
    version: parsed.version,
    shard: parsed.shard,
  };
}

export type { HubFileEntry };
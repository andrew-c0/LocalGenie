/**
 * GGUF filename parser.
 *
 * Implements the naming convention documented in
 * `memories/external/gguf/gguf.md`:
 *
 *   `[<Sidecar>]<BaseName><SizeLabel><FineTune><Version><Encoding><Type><Shard>.gguf`
 *
 * Each component is delimited by a `-` when present.
 */

/** Result of parsing a GGUF filename. */
export interface GGUFParseResult {
  sidecar: "mmproj" | "mtp" | null;
  baseName: string | null;
  sizeLabel: string | null;
  fineTune: string | null;
  version: string;
  encoding: string | null;
  type: "LoRA" | "vocab" | null;
  shard: string | null;
}

/** The GGUF naming-convention regex with an optional version. */
const GGUF_REGEX = /^(?:(?<Sidecar>mmproj|mtp)-)?(?<BaseName>[A-Za-z0-9\s._-]+?)(?:-(?<SizeLabel>(?:\d+x)?(?:\d+\.)?\d+[A-Za-z](?:-[A-Za-z]+(?:\d+\.)?\d+[A-Za-z]+)?))?(?:-(?<FineTune>[A-Za-z0-9\s._-]+?))?(?:-(?<Version>v\d+(?:\.\d+)*))?(?:-(?<Encoding>(?!LoRA|vocab)[\w_]+))?(?:-(?<Type>LoRA|vocab))?(?:-(?<Shard>\d{5}-of-\d{5}))?\.gguf$/;

/**
 * Parse a GGUF filename using the naming convention.
 * Returns `null` when the filename does not match the convention.
 */
function isQuantEncoding(s: string): boolean {
  // Matches Q[2-8][._]something or Q[2-8]Ksomething (case-insensitive)
  return /^Q[2-8][._][A-Za-z0-9_]+$/i.test(s) || /^Q[2-8]K[._][A-Za-z0-9_]+$/i.test(s);
}

export function parseGGUFFilename(filename: string): GGUFParseResult | null {
  const m = GGUF_REGEX.exec(filename);
  if (!m) return null;

  // biome-ignore lint/style/noNonNullAssertion: we would always return null if the regex didn't match, so groups is guaranteed to exist
  const groups = m.groups!;

  const result: GGUFParseResult = {
    sidecar: (groups.Sidecar as "mmproj" | "mtp" | undefined) ?? null,
    baseName: groups.BaseName?.trim() ?? null,
    sizeLabel: groups.SizeLabel?.trim() ?? null,
    fineTune: groups.FineTune?.trim() ?? null,
    version: groups.Version ?? "v1.0",
    encoding: groups.Encoding ?? null,
    type: (groups.Type as "LoRA" | "vocab" | undefined) ?? null,
    shard: groups.Shard ?? null,
  };

  // If encoding is null and fineTune looks like a quantization pattern, swap them
  if (!result.encoding && result.fineTune && isQuantEncoding(result.fineTune)) {
    result.encoding = result.fineTune;
    result.fineTune = null;
  }
  // If fineTune contains a dash and the first segment is quantization, split it
  // This handles cases like "Q4_K_M-GGUF" where GGUF may be a version tag
  else if (result.fineTune?.includes("-")) {
    const dashIdx = result.fineTune.indexOf("-");
    const firstPart = result.fineTune.substring(0, dashIdx);
    const rest = result.fineTune.substring(dashIdx + 1);
    if (isQuantEncoding(firstPart)) {
      result.encoding = firstPart;
      result.fineTune = rest || null;
    }
  }

  return result;
}

/** True when `filename` ends in `.gguf` and matches the naming convention. */
export function isGGUF(filename: string): boolean {
  return GGUF_REGEX.test(filename);
}
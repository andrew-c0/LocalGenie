/**
 * GGUF filename parser.
 *
 * Hugging Face repos name GGUF files loosely, so the parser looks for known
 * tokens anywhere in the name rather than relying on a fixed layout:
 *
 *   `[<Sidecar>-]<BaseName>[-<SizeLabel>][-<FineTune>][-<Version>][-<Precision>][-<Shard>].gguf`
 *
 * A sidecar marker (`mmproj` / `mtp` / `dflash`) may appear at the start, middle or end,
 * e.g. `mmproj-F16.gguf` or `gemma-4-E4B-it-mmproj.gguf`.
 */

/** Result of parsing a GGUF filename. */
export interface GGUFParseResult {
  sidecar: "mmproj" | "mtp" | "dflash" | null;
  /**
   * Model name without the sidecar, precision and shard tokens lowercased, e.g.
   * `gemma-4-e4b-it`. Files with the same stem belong to the same model.
   */
  stem: string;
  baseName: string | null;
  sizeLabel: string | null;
  /** Precision token as written in the file name, e.g. `Q4_K_M`, `IQ1_M`, `MXFP4_MOE`, `BF16`. */
  encoding: string | null;
  shard: string | null;
}

const EXTENSION = /\.gguf$/i;
const SHARD_SUFFIX = /-(\d{5}-of-\d{5})$/i;
const SIDECAR_TOKEN = /(?<=^|[-_])(mmproj|mtp|dflash)(?=[-_]|$)/gi;
const SIZE_LABEL =
  /(?<=^|[-_])((?:\d+x)?\d+(?:\.\d+)?[A-Za-z](?:-[A-Za-z]+\d+(?:\.\d+)?[A-Za-z]+)?)(?=[-_.]|$)/;
/**
 * Quantization / precision token: Q4_K_M, IQ1_M, PTQ1_0, PQ2_0, MXFP4_MOE, W4A16, INT8, BF16, F16, F32.
 * Up to two letters may precede the Q (e.g. the `PT` in `PTQ1_0`).
 */
const PRECISION_TOKEN =
  /(?<![A-Za-z0-9])([A-Za-z]{0,2}I?Q\d+(?:_[A-Za-z0-9]+)*|MXFP\d+(?:_[A-Za-z0-9]+)*|W\d+A\d+|W\d+|INT\d+|B?FP?(?:16|32))(?![A-Za-z0-9])/gi;

/**
 * True when `filename` is a `.gguf` file at the top level of its repo.
 * Files inside subfolders are not offered for download.
 */
export function isGGUF(filename: string): boolean {
  return EXTENSION.test(filename) && !filename.includes("/");
}

/** Parse a GGUF filename. Returns `null` when the filename is not a top-level GGUF file. */
export function parseGGUFFilename(filename: string): GGUFParseResult | null {
  if (!isGGUF(filename)) return null;

  const shard = SHARD_SUFFIX.exec(filename.replace(EXTENSION, ""))?.[1] ?? null;
  const name = filename.replace(EXTENSION, "").replace(SHARD_SUFFIX, "");
  const { sidecar, core } = findSidecarMarker(name);

  // The quantization is normally the last precision-like token in the name.
  const precisions = [...core.matchAll(PRECISION_TOKEN)];
  const precision = precisions.length > 0 ? precisions[precisions.length - 1] : null;
  const encoding = precision?.[1] ?? null;

  const size = SIZE_LABEL.exec(core);
  const cut = size?.index ?? precision?.index ?? core.length;
  const baseName = trimSeparators(core.slice(0, cut)) || null;

  const withoutPrecision = precision
    ? `${core.slice(0, precision.index)}-${core.slice(precision.index + precision[0].length)}`
    : core;
  const stem = trimSeparators(withoutPrecision.replace(/[-_]+/g, "-")).toLowerCase();

  return {
    sidecar,
    stem,
    baseName,
    sizeLabel: size?.[1] ?? null,
    encoding,
    shard,
  };
}

/**
 * A sidecar marker counts only at the edge of the name, before or after the precision, as in
 * `mmproj-F16` or `gemma-4-E4B-it-mmproj`. A token inside the name, such as the `MTP` in
 * `Tiel-Coder-35B-A3B-MTP-UD-IQ4_XS`, is part of the model name. `core` is the name without the marker.
 */
function findSidecarMarker(name: string): { sidecar: GGUFParseResult["sidecar"]; core: string } {
  for (const match of name.matchAll(SIDECAR_TOKEN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const before = name.slice(0, start).replace(/[-_]/g, "");
    const after = name.slice(end).replace(PRECISION_TOKEN, "").replace(/[-_]/g, "");
    if (before === "" || after === "") {
      return {
        sidecar: match[1].toLowerCase() as GGUFParseResult["sidecar"],
        core: `${name.slice(0, start)}-${name.slice(end)}`,
      };
    }
  }
  return { sidecar: null, core: name };
}

function trimSeparators(s: string): string {
  return s.replace(/^[-_]+|[-_]+$/g, "");
}

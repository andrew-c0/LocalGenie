import { estimateModelBytes, type RamFit, ramFitForBytes } from "../services/hubApi";

/** Effective bits per weight of a GGUF Q8_0 file (8-bit weights plus the per-block scales). */
const Q8_BITS_PER_WEIGHT = 8.5;
/** Effective bits per weight of a GGUF Q4_K_M file. */
const Q4_BITS_PER_WEIGHT = 4.85;
/** Memory a loaded model needs beyond its file: KV cache and activations. Same factor as the estimator. */
const FILE_OVERHEAD = 1.15;

const FIT_BADGE_LABEL: Record<RamFit["level"], string> = {
  fits: "Fits",
  tight: "Tight",
  no: "May not fit",
};

/** The RAM verdict a browse card shows for this PC. */
export interface CardRamVerdict {
  level: RamFit["level"];
  /** Short badge text, e.g. "Fits at 4-bit". */
  label: string;
  /** The RAM fit text for the smallest quantisation checked (4-bit), for the tooltip. */
  detail: string;
}

interface Memory {
  totalBytes: number;
  availableBytes: number;
}

/** RAM fit of a model with `paramCount` weights at `bitsPerWeight`. Null when the size cannot be estimated. */
function fitAt(paramCount: number, bitsPerWeight: number, memory: Memory): RamFit | null {
  const bytes = estimateModelBytes(paramCount, bitsPerWeight);
  return bytes == null ? null : ramFitForBytes(bytes, memory);
}

/**
 * The verdict for a Hugging Face card: the largest quantisation that fits (8-bit, then 4-bit),
 * else whether 4-bit fits tightly, else too large. Null when the parameter count or the memory
 * is unknown, so the card shows nothing rather than a guess.
 */
export function cardRamVerdict(
  paramCount: number | null | undefined,
  memory: Memory | null | undefined,
): CardRamVerdict | null {
  if (!paramCount || !memory) return null;
  const q4 = fitAt(paramCount, Q4_BITS_PER_WEIGHT, memory);
  if (!q4) return null;
  const q8 = fitAt(paramCount, Q8_BITS_PER_WEIGHT, memory);
  const detail = q4.label;

  if (q8?.level === "fits") return { level: "fits", label: "Fits up to 8-bit", detail };
  if (q4.level === "fits") return { level: "fits", label: "Fits at 4-bit", detail };
  if (q4.level === "tight") return { level: "tight", label: "Tight at 4-bit", detail };
  return { level: "no", label: "Too large for this PC", detail };
}

/**
 * The verdict for a model with a known file size (AI Hub's "Model Size"): the file plus the
 * overhead, against the free and total RAM. The detail is the RAM fit text. Null when the size
 * or the memory is unknown.
 */
export function cardRamVerdictFromBytes(
  fileBytes: number | null | undefined,
  memory: Memory | null | undefined,
): CardRamVerdict | null {
  if (!fileBytes || !memory) return null;
  const fit = ramFitForBytes(Math.round(fileBytes * FILE_OVERHEAD), memory);
  return { level: fit.level, label: FIT_BADGE_LABEL[fit.level], detail: fit.label };
}

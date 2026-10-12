/**
 * Mapping of the Hugging Face Hub public API (`https://huggingface.co/api/models`)
 * for browsing models inside the app. Based on the Hub OpenAPI spec
 * (memories/external/huggingFace/hub-api-endpoints.json).
 *
 * The Qualcomm AI Hub area always applies `author=qualcomm`.
 */

const HUB_BASE = "https://huggingface.co";

/** Sort keys supported by GET /api/models. */
export type HubSort = "downloads" | "likes" | "lastModified" | "trendingScore" | "createdAt";

/** A model entry returned by GET /api/models. */
export interface HubModel {
  _id: string;
  id: string;
  likes?: number;
  downloads?: number;
  trendingScore?: number;
  pipeline_tag?: string;
  library_name?: string;
  tags?: string[];
  createdAt?: string;
  lastModified?: string;
  gated?: boolean | string;
  private?: boolean;
  /** Present on GET /api/models/{id} — total parameter count of the repo. */
  safetensors?: { total?: number; parameters?: number };
}

/** One active filter chip. Encoded as `filter=<type>:<value>` on the wire. */
export interface HubFilter {
  type: "pipeline_tag" | "library" | "license" | "quantization";
  value: string;
}

export interface HubQuery {
  /** Free-text search. */
  search?: string;
  /** Restrict to an author/org, e.g. "qualcomm". */
  author?: string;
  sort?: HubSort;
  /** true = ascending, false (default) = descending. */
  ascending?: boolean;
  filters?: HubFilter[];
  /** Page size (max 1000). */
  limit?: number;
  /** Cursor from a previous response's `Link` header for pagination. */
  cursor?: string;
}

export interface HubPage {
  models: HubModel[];
  /** Cursor for the next page, or null when exhausted. */
  nextCursor: string | null;
}

/** Well-known chip values surfaced in the Qualcomm AI Hub browse UI. */
export const PIPELINE_TAG_CHIPS = [
  "text-generation",
  "text2text-generation",
  "image-text-to-text",
  "feature-extraction",
  "image-classification",
  "object-detection",
] as const;

export const LIBRARY_CHIPS = ["transformers", "llama.cpp", "onnx", "gguf", "pytorch"] as const;

export const LICENSE_CHIPS = ["apache-2.0", "mit", "llama3.2", "gemma", "qwen", "other"] as const;

export const QUANTIZATION_CHIPS = ["4-bit", "8-bit", "quantized"] as const;

/**
 * Map a filter chip to the actual tag value the HF API `filter` param expects.
 * HF filters are plain tags: pipeline tags as-is, libraries as-is, licenses
 * prefixed with `license:`, quantization as-is.
 */
function filterToTag(f: HubFilter): string {
  switch (f.type) {
    case "license":
      return `license:${f.value}`;
    case "pipeline_tag":
    case "library":
    case "quantization":
    default:
      return f.value;
  }
}

/** Build query string for GET /api/models. */
function buildQuery(q: HubQuery): string {
  const params = new URLSearchParams();
  if (q.search) params.set("search", q.search);
  if (q.author) params.set("author", q.author);
  if (q.sort) params.set("sort", q.sort);
  params.set("direction", q.ascending ? "1" : "-1");
  for (const f of q.filters ?? []) params.append("filter", filterToTag(f));
  params.set("limit", String(q.limit ?? 30));
  if (q.cursor) params.set("cursor", q.cursor);
  return params.toString();
}

/** Extract the pagination cursor from the `Link` response header. */
function parseCursor(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const m = linkHeader.match(/<[^>]*[?&]cursor=([^&>]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * GET /api/models — list models with sorting, filtering and cursor pagination.
 * Public endpoint, no auth required for public repos.
 * Retries once after a short backoff on 429 (HF rate limiting).
 */
export async function listHubModels(query: HubQuery): Promise<HubPage> {
  const url = `${HUB_BASE}/api/models?${buildQuery(query)}`;
  let res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await fetch(url, { headers: { Accept: "application/json" } });
  }
  if (!res.ok) {
    throw new Error(
      res.status === 429
        ? "Hugging Face rate limit reached — try again in a moment."
        : `Hugging Face API error ${res.status}: ${res.statusText}`,
    );
  }
  const models = (await res.json()) as HubModel[];
  return { models, nextCursor: parseCursor(res.headers.get("Link")) };
}

/** GET /api/models/{namespace}/{repo} — full details for one model. */
export async function getHubModel(repoId: string): Promise<HubModel> {
  const res = await fetch(`${HUB_BASE}/api/models/${repoId}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Hugging Face API error ${res.status}: ${res.statusText}`);
  return (await res.json()) as HubModel;
}

/** One file entry from the repo tree (GET /api/models/{id}/tree/{rev}). */
export interface HubFileEntry {
  type: "file" | "directory";
  path: string;
  size?: number;
  oid?: string;
}

/**
 * GET /api/models/{id}/tree/main — list top-level files of a model repo.
 * Used by the model detail page to show weights and config files.
 */
export async function listHubModelFiles(repoId: string, rev = "main"): Promise<HubFileEntry[]> {
  const res = await fetch(`${HUB_BASE}/api/models/${repoId}/tree/${rev}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Hugging Face API error ${res.status}: ${res.statusText}`);
  return (await res.json()) as HubFileEntry[];
}

/**
 * Fetch the raw README.md of a model repo (resolve endpoint, follows redirect).
 * Returns null when the repo has no README.
 */
export async function fetchHubModelReadme(repoId: string, rev = "main"): Promise<string | null> {
  const res = await fetch(`${HUB_BASE}/${repoId}/resolve/${rev}/README.md`);
  if (!res.ok) return null;
  return res.text();
}

// ─── release_assets.json (Qualcomm AI Hub releases) ─────────────

/** A single downloadable asset with its direct download URL. */
export interface ReleaseAsset {
  /** Runtime/toolchain that produced the asset, e.g. `genie`, `geniex_qairt`, `geniex_llamacpp`. */
  runtime: string;
  /** Tool versions used to build the asset, e.g. `{ qairt: "2.45.0..." }`. */
  tool_versions?: Record<string, string>;
  /** Direct download URL (HF resolve or qaihub S3). */
  download_url: string;
}

/** One precision entry from release_assets.json. */
export interface ReleasePrecision {
  /** Precision key, e.g. `q4_0`, `w4a16`. */
  precision: string;
  /** Chipset-specific assets keyed by chipset slug (e.g. `qualcomm-snapdragon-x-elite`). */
  chipset_assets: Record<string, ReleaseAsset[]>;
  /** Universal (chipset-independent) assets, e.g. GGUF for llama.cpp. */
  universal_assets: Record<string, ReleaseAsset[]>;
}

/** Parsed release_assets.json for a model. */
export interface ReleaseAssets {
  /** Release version, e.g. `0.63.0`. */
  version: string;
  precisions: ReleasePrecision[];
}

/**
 * Fetch and parse release_assets.json from a model repo.
 * Results are cached per repo so tiles can reuse the compatibility info
 * after the user has visited a model's detail page once.
 * Returns null when the repo has no such file (not an AI Hub release).
 */
const releaseAssetsCache = new Map<string, ReleaseAssets | null>();

export async function fetchReleaseAssets(
  repoId: string,
  rev = "main",
): Promise<ReleaseAssets | null> {
  const cacheKey = `${repoId}@${rev}`;
  if (releaseAssetsCache.has(cacheKey)) return releaseAssetsCache.get(cacheKey) ?? null;
  const res = await fetch(`${HUB_BASE}/${repoId}/resolve/${rev}/release_assets.json`);
  if (!res.ok) {
    releaseAssetsCache.set(cacheKey, null);
    return null;
  }
  const raw = (await res.json()) as RawReleaseAssets;
  const parsed = parseReleaseAssets(raw);
  releaseAssetsCache.set(cacheKey, parsed);
  return parsed;
}

/** Raw shape of release_assets.json before normalization. */
interface RawReleaseAsset {
  tool_versions?: Record<string, string>;
  download_url?: string;
}

interface RawReleaseAssets {
  version?: string;
  precisions?: Record<
    string,
    {
      universal_assets?: Record<string, RawReleaseAsset>;
      chipset_assets?: Record<string, Record<string, RawReleaseAsset>>;
    }
  >;
}

/** Runtimes excluded from release assets (not usable by LocalGenie). */
const EXCLUDED_RUNTIMES = new Set(["tflite", "qnn_dlc"]);

/** Normalize one raw asset entry into a ReleaseAsset. */
function normalizeAsset(runtime: string, raw?: RawReleaseAsset): ReleaseAsset | null {
  if (EXCLUDED_RUNTIMES.has(runtime)) return null;
  if (!raw?.download_url) return null;
  return {
    runtime,
    tool_versions: raw.tool_versions,
    download_url: raw.download_url,
  };
}

/** Map the raw release_assets.json into the normalized ReleaseAssets shape. */
function parseReleaseAssets(raw: RawReleaseAssets): ReleaseAssets {
  const precisions: ReleasePrecision[] = [];
  for (const [precision, entry] of Object.entries(raw.precisions ?? {})) {
    const chipset_assets = {} as Record<string, ReleaseAsset[]>;
    for (const [chipset, runtimes] of Object.entries(entry.chipset_assets ?? {})) {
      const assets = Object.entries(runtimes ?? {})
        .map(([runtime, a]) => normalizeAsset(runtime, a))
        .filter((a): a is ReleaseAsset => a !== null);
      if (assets.length > 0) chipset_assets[chipset] = assets;
    }
    const universal_assets = {} as Record<string, ReleaseAsset[]>;
    for (const [runtime, a] of Object.entries(entry.universal_assets ?? {})) {
      const asset = normalizeAsset(runtime, a);
      if (asset) universal_assets[runtime] = [asset];
    }
    precisions.push({ precision, chipset_assets, universal_assets });
  }
  return { version: raw.version ?? "unknown", precisions };
}

/** Chipset slugs shown when the device CPU cannot be matched to any asset. */
export const FALLBACK_CHIPSET_SLUGS = [
  "qualcomm-snapdragon-x-elite",
  "qualcomm-snapdragon-x2-elite",
] as const;

/**
 * Match the device's chipset name (from `geniex config get chipset`, e.g.
 * "Snapdragon X Elite CRD") against release asset chipset slugs
 * (e.g. "qualcomm-snapdragon-x-elite"). Returns the matching slugs, or the
 * X Elite / X2 Elite fallbacks when nothing matches.
 */
export function matchChipsetSlugs(deviceChipset: string | null, slugs: string[]): string[] {
  if (!deviceChipset) return [...FALLBACK_CHIPSET_SLUGS];
  // Normalize: lowercase, strip qualifiers like "CRD", "for Galaxy", "8-core".
  const norm = deviceChipset
    .toLowerCase()
    .replace(/\bcrd\b|\bfor galaxy\b|\b\d+-core\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = norm.split(" ").filter(Boolean);
  const matched = slugs.filter((slug) => {
    const slugNorm = slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    // Every device token must appear in the slug (e.g. "snapdragon x elite").
    return tokens.every((t) => slugNorm.includes(t));
  });
  return matched.length > 0 ? matched : [...FALLBACK_CHIPSET_SLUGS];
}

/** Compatibility of a model's release assets with this device. */
export type AssetCompat = "universal" | "chipset" | "none" | "unknown";

/**
 * Summarize a parsed release_assets.json against the matched chipset slugs:
 * - "universal": at least one precision has universal (device-independent) assets
 * - "chipset": no universal assets, but a precision has an asset for a matched chipset
 * - "none": assets exist but none are usable on this device
 */
export function assetCompatibility(release: ReleaseAssets, chipsetSlugs: string[]): AssetCompat {
  for (const p of release.precisions) {
    if (Object.keys(p.universal_assets).length > 0) return "universal";
  }
  for (const p of release.precisions) {
    if (Object.keys(p.chipset_assets).some((c) => chipsetSlugs.includes(c))) return "chipset";
  }
  return "none";
}

/**
 * When exactly one downloadable variant exists for this device (one precision
 * with a single usable asset), return it so the UI can skip the version
 * dialog and download immediately. Returns null when there are 0 or 2+ options.
 */
export function singleDownloadOption(
  release: ReleaseAssets,
  chipsetSlugs: string[],
): { asset: ReleaseAsset; precision: string } | null {
  const options: { asset: ReleaseAsset; precision: string }[] = [];
  for (const p of release.precisions) {
    for (const assets of Object.values(p.universal_assets)) {
      for (const asset of assets) options.push({ asset, precision: p.precision });
    }
    for (const [chipset, assets] of Object.entries(p.chipset_assets)) {
      if (!chipsetSlugs.includes(chipset)) continue;
      for (const asset of assets) options.push({ asset, precision: p.precision });
    }
  }
  return options.length === 1 ? options[0] : null;
}

/** URL of the model page on huggingface.co. */
export function hubModelPageUrl(repoId: string): string {
  return `${HUB_BASE}/${repoId}`;
}

/** Convenience: browse Qualcomm AI Hub models (always author=qualcomm). */
export function listQualcommModels(query: Omit<HubQuery, "author">): Promise<HubPage> {
  return listHubModels({ ...query, author: "qualcomm" });
}

/** Extract chip-worthy tags from a model's tag list for card display. */
export function modelTagChips(model: HubModel): string[] {
  const chips: string[] = [];
  if (model.pipeline_tag) chips.push(model.pipeline_tag);
  if (model.library_name) chips.push(model.library_name);
  for (const tag of model.tags ?? []) {
    if (
      /^(4-bit|8-bit|quantized)$/.test(tag) ||
      /^(apache-2\.0|mit|llama[\d.]*|gemma|qwen[\d.]*|other)$/.test(tag)
    ) {
      chips.push(tag);
    }
  }
  return [...new Set(chips)].slice(0, 5);
}

// ─── Precision metadata & System RAM fit ─────────────────────────

/** Human-readable metadata for a precision key (e.g. `q4_0`). */
export interface PrecisionInfo {
  label: string;
  description: string;
  /** Effective bits per weight; null when unknown (no size estimate). */
  bitsPerWeight: number | null;
}

/** Ordered precision table — first match wins, most specific first. */
const PRECISION_DEFS: {
  pattern: RegExp;
  label: string;
  description: string;
  bits: number | null;
}[] = [
  {
    pattern: /^f32$|^fp32$|^float32$/,
    label: "FP32",
    description: "Full 32-bit float — highest accuracy, 4× the memory",
    bits: 32,
  },
  {
    pattern: /^bf16$|^bfloat16$/,
    label: "BF16",
    description: "16-bit brain float — near-FP16 accuracy",
    bits: 16,
  },
  {
    pattern: /^f16$|^fp16$|^float16$|^half$/,
    label: "FP16",
    description: "16-bit float — baseline quality, largest footprint",
    bits: 16,
  },
  {
    pattern: /^q8_1$|^q8_0$|^q8$|^int8$|^w8a8$|^w8a16$|^w8$/,
    label: "Q8 / 8-bit",
    description: "8-bit — near-lossless, about half of FP16 memory",
    bits: 8,
  },
  { pattern: /^q6_k$|^q6$/, label: "Q6_K", description: "6-bit — very high quality", bits: 6 },
  {
    pattern: /^q5_k_m$|^q5_k_s$|^q5_k$|^q5_1$|^q5_0$|^q5$/,
    label: "Q5 / 5-bit",
    description: "5-bit — high quality",
    bits: 5,
  },
  {
    pattern: /^w4a16$|^w4a8$|^int4$|^q4_k_m$|^q4_k_s$|^q4_k$|^q4_1$|^q4_0$|^q4$|^w4$/,
    label: "Q4 / 4-bit",
    description: "4-bit — best Hexagon NPU support, recommended",
    bits: 4.5,
  },
  {
    pattern: /^w3|^q3/,
    label: "3-bit",
    description: "3-bit — smallest, reduced quality",
    bits: 3,
  },
  {
    pattern: /^w2|^q2/,
    label: "2-bit",
    description: "2-bit — smallest, significant quality trade-offs",
    bits: 2,
  },
];

/** Look up label/description/bits-per-weight for a precision key. */
export function precisionInfo(key: string): PrecisionInfo {
  const hit = PRECISION_DEFS.find((d) => d.pattern.test(key.toLowerCase()));
  if (hit) return { label: hit.label, description: hit.description, bitsPerWeight: hit.bits };
  // Generic "N-bit" keys (e.g. "4-bit", "8-bit") still give a size estimate.
  const generic = key.match(/(\d+(?:\.\d+)?)\s*bit/i);
  if (generic) {
    const bits = Number.parseFloat(generic[1]);
    return {
      label: key.toUpperCase(),
      description: `${generic[1]}-bit quantization`,
      bitsPerWeight: Number.isFinite(bits) ? bits : null,
    };
  }
  return { label: key.toUpperCase(), description: "Custom precision", bitsPerWeight: null };
}

/**
 * Parse a parameter count out of a repo id, e.g. `Qwen3-4B` → 4e9.
 * Returns null when no `NB`/`N.NB` token is present.
 */
export function parseParamCount(repoId: string): number | null {
  const m = repoId.match(/[-_ .](\d+(?:\.\d+)?)[bB](?![a-zA-Z0-9])/);
  if (!m) return null;
  const b = Number.parseFloat(m[1]);
  return Number.isFinite(b) && b > 0 ? b * 1e9 : null;
}

/**
 * Rough resident-memory estimate for a model:
 * bits/param × param count × 1.15 (weights + KV cache + activations).
 */
export function estimateModelBytes(
  paramsCount: number | null,
  bitsPerWeight: number | null,
): number | null {
  if (paramsCount == null || bitsPerWeight == null) return null;
  return Math.round((paramsCount * bitsPerWeight * 1.15) / 8);
}

/** Verdict of a precision footprint against System RAM. */
export interface RamFit {
  level: "fits" | "tight" | "no";
  label: string;
}

/** Compare an estimated model footprint against total/available RAM. */
export function ramFitForBytes(
  bytes: number,
  memory: { totalBytes: number; availableBytes: number },
): RamFit {
  const gb = (b: number) => `${(b / 2 ** 30).toFixed(1)} GB`;
  if (bytes <= memory.availableBytes * 0.9) {
    return { level: "fits", label: `Fits — ${gb(bytes)} of ${gb(memory.availableBytes)} free` };
  }
  if (bytes <= memory.totalBytes * 0.85) {
    return {
      level: "tight",
      label: `Tight — needs ${gb(bytes)}, ${gb(memory.availableBytes)} free`,
    };
  }
  return { level: "no", label: `May not fit — ${gb(bytes)} vs ${gb(memory.totalBytes)} RAM` };
}

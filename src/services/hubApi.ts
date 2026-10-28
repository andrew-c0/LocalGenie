/**
 * Mapping of the Hugging Face Hub public API (`https://huggingface.co/api/models`)
 * for browsing models inside the app. Based on the Hub OpenAPI spec
 * (memories/external/huggingFace/hub-api-endpoints.json).
 *
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
  /** Present on GET /api/models/{id}?expand[]=gguf for GGUF repos — metadata read from the GGUF file. */
  gguf?: { architecture?: string; context_length?: number; total?: number };
}

/** Parameter-count bounds in billions. An unset bound is open-ended. */
export interface ParamRange {
  min?: number;
  max?: number;
}

export interface HubQuery {
  /** Free-text search. */
  search?: string;
  /** Restrict to an author/org, e.g. "TheBloke". */
  author?: string;
  sort?: HubSort;
  /** true = ascending, false (default) = descending. */
  ascending?: boolean;
  /** Tags, each sent as `filter=<tag>`. Repeated filters are ANDed by the Hub. */
  tags?: string[];
  numParams?: ParamRange;
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

/** Build query string for GET /api/models. */
function buildQuery(q: HubQuery): string {
  const params = new URLSearchParams();
  if (q.search) params.set("search", q.search);
  if (q.author) params.set("author", q.author);
  if (q.sort) params.set("sort", q.sort);
  params.set("direction", q.ascending ? "1" : "-1");
  for (const tag of q.tags ?? []) params.append("filter", tag);
  const range = numParamsValue(q.numParams);
  if (range) params.set("num_parameters", range);
  // With `expand[]` the Hub returns only the expanded fields, so the card fields are listed too:
  // counts and tags, plus the sizes and GGUF metadata for the card facets.
  for (const field of ["downloads", "likes", "tags", "lastModified", "gated", "safetensors", "gguf"]) {
    params.append("expand[]", field);
  }
  params.set("limit", String(q.limit ?? 30));
  if (q.cursor) params.set("cursor", q.cursor);
  return params.toString();
}

/** `num_parameters` value such as `min:1B,max:4B`; null when neither bound is set. */
function numParamsValue(range: ParamRange | undefined): string | null {
  const parts: string[] = [];
  if (range?.min != null) parts.push(`min:${range.min}B`);
  if (range?.max != null) parts.push(`max:${range.max}B`);
  return parts.length > 0 ? parts.join(",") : null;
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

/**
 * GET /api/models/{namespace}/{repo} — full details for one model, with its GGUF metadata merged in.
 * `expand[]=gguf` returns only the expanded fields, so it is fetched separately and the GGUF metadata
 * is merged in; the base response keeps downloads, likes and the rest.
 */
export async function getHubModel(repoId: string): Promise<HubModel> {
  const headers = { Accept: "application/json" };
  const [baseRes, ggufRes] = await Promise.all([
    fetch(`${HUB_BASE}/api/models/${repoId}`, { headers }),
    fetch(`${HUB_BASE}/api/models/${repoId}?expand[]=gguf`, { headers }).catch(() => null),
  ]);
  if (!baseRes.ok)
    throw new Error(`Hugging Face API error ${baseRes.status}: ${baseRes.statusText}`);
  const model = (await baseRes.json()) as HubModel;
  if (ggufRes?.ok) {
    const expanded = (await ggufRes.json()) as Partial<HubModel>;
    if (expanded.gguf) model.gguf = expanded.gguf;
  }
  return model;
}

/** Native context window (tokens) from the repo's GGUF metadata, or null when the repo does not report one. */
export async function fetchContextLength(repoId: string): Promise<number | null> {
  try {
    const model = await getHubModel(repoId);
    return model.gguf?.context_length ?? null;
  } catch {
    return null;
  }
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

/** URL of the model page on huggingface.co. */
export function hubModelPageUrl(repoId: string): string {
  return `${HUB_BASE}/${repoId}`;
}

/** One value of the filter catalogue: `id` is the tag sent to the API. */
export interface HubTag {
  id: string;
  label: string;
}

/** Filter values the Hub publishes, per type. */
export interface HubTagCatalogue {
  pipeline: HubTag[];
  library: HubTag[];
  /** Licence ids without the `license:` prefix. */
  license: string[];
}

interface RawTag {
  id: string;
  label?: string;
}

let tagCatalogue: Promise<HubTagCatalogue> | null = null;

/**
 * GET /api/models-tags-by-type: the pipeline, library and licence values. Fetched once per session;
 * a failed fetch is not cached, so the next call tries again.
 */
export function listHubTags(): Promise<HubTagCatalogue> {
  if (!tagCatalogue) {
    tagCatalogue = fetchHubTags().catch((err: unknown) => {
      tagCatalogue = null;
      throw err;
    });
  }
  return tagCatalogue;
}

async function fetchHubTags(): Promise<HubTagCatalogue> {
  const res = await fetch(`${HUB_BASE}/api/models-tags-by-type`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Hugging Face API error ${res.status}: ${res.statusText}`);
  const raw = (await res.json()) as Record<string, RawTag[] | undefined>;
  const toTag = (t: RawTag): HubTag => ({ id: t.id, label: t.label ?? t.id });
  return {
    pipeline: (raw.pipeline_tag ?? []).map(toTag),
    library: (raw.library ?? []).map(toTag),
    license: (raw.license ?? []).map((t) => t.id.replace(/^license:/, "")),
  };
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
    pattern: /^q8|^int8$|^w8/,
    label: "Q8 / 8-bit",
    description: "8-bit — near-lossless, about half of FP16 memory",
    bits: 8,
  },
  { pattern: /^q6/, label: "Q6_K", description: "6-bit — very high quality", bits: 6 },
  {
    pattern: /^q5/,
    label: "Q5 / 5-bit",
    description: "5-bit — high quality",
    bits: 5,
  },
  {
    pattern: /^ptq1/,
    label: "PTQ1_0",
    description: "Ternary weights packed densely — 1.75 bits/weight",
    bits: 1.75,
  },
  {
    pattern: /^pq2/,
    label: "PQ2_0",
    description: "Ternary weights in 2-bit slots — 2.13 bits/weight",
    bits: 2.13,
  },
  {
    pattern: /^mxfp4/,
    label: "MXFP4",
    description: "4-bit microscaling float — compact, NPU-oriented",
    bits: 4.25,
  },
  {
    pattern: /^i?q4|^w4|^int4$/,
    label: "Q4 / 4-bit",
    description: "4-bit — best Hexagon NPU support, recommended",
    bits: 4.5,
  },
  {
    pattern: /^i?q3|^w3/,
    label: "3-bit",
    description: "3-bit — smallest, reduced quality",
    bits: 3,
  },
  {
    pattern: /^i?q2|^w2/,
    label: "2-bit",
    description: "2-bit — smallest, significant quality trade-offs",
    bits: 2,
  },
  {
    pattern: /^i?q1/,
    label: "1-bit",
    description: "1-bit — tiny footprint, severe quality loss",
    bits: 1.75,
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

/**
 * Facets of a Hugging Face model: task, parameters, library, licence, model tree and quantisation.
 * Pure functions over the Hub's list or detail response. One summary type feeds the browse cards,
 * the detail page and the stored row of a downloaded model.
 */

/** The Hub fields the facets are read from. Both list and detail responses have them. */
export interface HubFacetSource {
  tags?: string[];
  pipeline_tag?: string;
  library_name?: string;
  safetensors?: { total?: number };
  gguf?: { total?: number };
}

export const TASK_GROUPS = [
  { id: "multimodal", label: "Multimodal" },
  { id: "cv", label: "Computer Vision" },
  { id: "nlp", label: "NLP" },
  { id: "audio", label: "Audio" },
  { id: "tabular", label: "Tabular" },
  { id: "rl", label: "Reinforcement Learning" },
  { id: "other", label: "Other" },
] as const;

export type TaskGroupId = (typeof TASK_GROUPS)[number]["id"];

/** The Hub has no task grouping, so it is kept here, keyed by pipeline id. Unlisted ids are Other. */
export const PIPELINES_BY_GROUP: Record<TaskGroupId, readonly string[]> = {
  multimodal: [
    "audio-text-to-text",
    "image-text-to-text",
    "image-text-to-image",
    "image-text-to-video",
    "visual-question-answering",
    "document-question-answering",
    "video-text-to-text",
    "visual-document-retrieval",
    "any-to-any",
  ],
  cv: [
    "depth-estimation",
    "image-classification",
    "object-detection",
    "image-segmentation",
    "text-to-image",
    "image-to-text",
    "image-to-image",
    "image-to-video",
    "unconditional-image-generation",
    "video-classification",
    "text-to-video",
    "zero-shot-image-classification",
    "mask-generation",
    "zero-shot-object-detection",
    "text-to-3d",
    "image-to-3d",
    "image-feature-extraction",
    "keypoint-detection",
    "video-to-video",
  ],
  nlp: [
    "text-classification",
    "token-classification",
    "table-question-answering",
    "question-answering",
    "zero-shot-classification",
    "translation",
    "summarization",
    "feature-extraction",
    "text-generation",
    "fill-mask",
    "sentence-similarity",
    "text-ranking",
  ],
  audio: [
    "text-to-speech",
    "text-to-audio",
    "automatic-speech-recognition",
    "audio-to-audio",
    "audio-classification",
    "voice-activity-detection",
  ],
  tabular: ["tabular-classification", "tabular-regression", "time-series-forecasting"],
  rl: ["reinforcement-learning", "robotics"],
  other: ["graph-ml"],
};

const GROUP_BY_PIPELINE = new Map<string, TaskGroupId>(
  TASK_GROUPS.flatMap((g) => PIPELINES_BY_GROUP[g.id].map((p) => [p, g.id] as const)),
);

/** Task group of a pipeline id; null when the model has no task. */
export function taskGroupOf(task: string | null | undefined): TaskGroupId | null {
  if (!task) return null;
  return GROUP_BY_PIPELINE.get(task) ?? "other";
}

/** Readable task name, e.g. `text-generation` -> `Text generation`. */
export function taskLabel(task: string): string {
  const words = task.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface ParamCount {
  count: number;
  /** True when the count comes only from GGUF metadata, which can be wrong. */
  approximate: boolean;
}

/**
 * Parameter count: the safetensors total when the repo has one, else the GGUF total marked
 * approximate (the GGUF total can be off for some repos). Null when neither is reported.
 */
export function paramCountOf(model: HubFacetSource): ParamCount | null {
  const safetensors = model.safetensors?.total;
  if (safetensors) return { count: safetensors, approximate: false };
  const gguf = model.gguf?.total;
  if (gguf) return { count: gguf, approximate: true };
  return null;
}

/** Billions with one decimal where needed: `7.6B`, `8B`, `270M`. */
export function formatParamCount(count: number): string {
  if (count >= 1e9) return `${Number.parseFloat((count / 1e9).toFixed(1))}B`;
  if (count >= 1e6) return `${Math.round(count / 1e6)}M`;
  return String(count);
}

export const BASE_RELATIONS = ["quantized", "finetune", "adapter", "merge"] as const;
export type BaseRelation = (typeof BASE_RELATIONS)[number];

export interface BaseModel {
  relation: BaseRelation;
  repo: string;
}

/**
 * The base model from a `base_model:<relation>:<repo>` tag. Null for a base model, which has no
 * such tag.
 */
export function baseModelOf(tags: string[] | undefined): BaseModel | null {
  for (const tag of tags ?? []) {
    const m = tag.match(/^base_model:(quantized|finetune|adapter|merge):(.+)$/);
    if (m) return { relation: m[1] as BaseRelation, repo: m[2] };
  }
  return null;
}

/** Licence id from the `license:<id>` tag, e.g. `apache-2.0`. */
export function licenseOf(tags: string[] | undefined): string | null {
  const tag = (tags ?? []).find((t) => t.startsWith("license:"));
  return tag ? tag.slice("license:".length) : null;
}

/** Quantisation bits from the `4-bit` and `8-bit` tags, sorted. */
export function quantBitsOf(tags: string[] | undefined): number[] {
  const bits = new Set<number>();
  for (const tag of tags ?? []) {
    const m = tag.match(/^(4|8)-bit$/);
    if (m) bits.add(Number(m[1]));
  }
  return [...bits].sort((a, b) => a - b);
}

/** The six facets of one model. Stored as JSON for downloaded models (see `serializeFacets`). */
export interface HubFacetSummary {
  task: string | null;
  library: string | null;
  license: string | null;
  paramCount: number | null;
  paramCountApproximate: boolean;
  baseRelation: BaseRelation | null;
  baseRepo: string | null;
  quantBits: number[];
}

/** Library ids a model can carry as a tag, most specific first. */
const LIBRARY_TAGS = [
  "gguf",
  "safetensors",
  "transformers",
  "pytorch",
  "tf",
  "jax",
  "onnx",
  "mlx",
  "diffusers",
  "peft",
  "sentence-transformers",
];

/**
 * The task: the pipeline tag, else the first tag that is a known task. The list endpoint does not
 * return the pipeline tag when fields are expanded, so the tags are the fallback.
 */
export function taskOf(model: HubFacetSource): string | null {
  if (model.pipeline_tag) return model.pipeline_tag;
  return (model.tags ?? []).find((t) => GROUP_BY_PIPELINE.has(t)) ?? null;
}

/** The library: the library name, else the first library id among the tags. */
export function libraryOf(model: HubFacetSource): string | null {
  if (model.library_name) return model.library_name;
  return (model.tags ?? []).find((t) => LIBRARY_TAGS.includes(t)) ?? null;
}

export function facetSummaryFromModel(model: HubFacetSource): HubFacetSummary {
  const params = paramCountOf(model);
  const base = baseModelOf(model.tags);
  return {
    task: taskOf(model),
    library: libraryOf(model),
    license: licenseOf(model.tags),
    paramCount: params?.count ?? null,
    paramCountApproximate: params?.approximate ?? false,
    baseRelation: base?.relation ?? null,
    baseRepo: base?.repo ?? null,
    quantBits: quantBitsOf(model.tags),
  };
}

export function serializeFacets(summary: HubFacetSummary): string {
  return JSON.stringify(summary);
}

/**
 * Read a stored summary. Returns null for missing or unreadable text. Fields that are not the
 * expected type fall back to their empty value, so an older or partial row still shows what it has.
 */
export function parseFacets(json: string | null | undefined): HubFacetSummary | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const relation = BASE_RELATIONS.find((b) => b === r.baseRelation) ?? null;
  return {
    task: str(r.task),
    library: str(r.library),
    license: str(r.license),
    paramCount: typeof r.paramCount === "number" ? r.paramCount : null,
    paramCountApproximate: r.paramCountApproximate === true,
    baseRelation: relation,
    baseRepo: str(r.baseRepo),
    quantBits: Array.isArray(r.quantBits)
      ? r.quantBits.filter((b): b is number => typeof b === "number")
      : [],
  };
}

/** Compact size for a card: `~7.6B` when approximate, `7.6B` otherwise, null when unknown. */
export function sizeLabelOf(summary: HubFacetSummary): string | null {
  if (summary.paramCount == null) return null;
  const size = formatParamCount(summary.paramCount);
  return summary.paramCountApproximate ? `~${size}` : size;
}

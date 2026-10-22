import type {
  ChatSettings,
  ModelInfo,
  ModelLoadParams,
  ModelLoadSettings,
  ServerSettings,
  StoredModelSettings,
} from "../types";

/** Engine a model runs on: GGUF models use llama.cpp, Qualcomm AI Hub bundles use QAIRT. */
export type ModelEngine = "llama_cpp" | "qairt";

/** Defaults matching the GenieX CLI. `compute` falls back to the header choice. */
export const DEFAULT_LOAD_SETTINGS: ModelLoadSettings = {
  ngl: -1,
};

/**
 * Context window shown when neither the settings nor the model's GGUF metadata has one. This is
 * the GenieX CLI default. A model's own length is used before it, so it is never overwritten.
 */
export const DEFAULT_CONTEXT_WINDOW = 4096;

/** App-wide server defaults, used until the Application & Runtime settings are saved. */
export const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  origins: "*",
  keepalive: 300,
};

/** Speculative decoding types accepted by `geniex serve --spec-type` (one at a time in the UI). */
export const SPEC_TYPES = [
  "draft-mtp",
  "draft-eagle3",
  "draft-simple",
  "ngram-simple",
  "ngram-map-k",
  "ngram-map-k4v",
  "ngram-mod",
  "ngram-cache",
] as const;

/** HTP power modes accepted by `--power-mode`. The server default is `burst`. */
export const POWER_MODES = [
  "low_power_saver",
  "power_saver",
  "high_power_saver",
  "low_balanced",
  "balanced",
  "high_performance",
  "sustained_high_performance",
  "burst",
] as const;

/** True for the speculative types that load a separate draft model. */
export function usesDraftModel(specType: string | undefined): boolean {
  return specType?.startsWith("draft-") ?? false;
}

/** Keys saved by earlier versions in the per-model row. They are server settings now, so never sent. */
const LEGACY_SERVER_KEYS = ["origins", "keepalive"];

/** Keys that are sent with every chat request as load parameters. */
const LOAD_PARAM_KEYS: (keyof ModelLoadParams)[] = [
  "nctx",
  "ngl",
  "compute",
  "powerMode",
  "specType",
  "specDraftModel",
  "specNMax",
  "specNMin",
  "specPMin",
];

/**
 * Key under which a model's settings are saved and read. Strips a `:precision` suffix so
 * `org/repo:W4A16` and `org/repo` share one row.
 */
export function modelSettingsKey(modelId: string): string {
  const colon = modelId.lastIndexOf(":");
  return colon === -1 ? modelId : modelId.slice(0, colon);
}

/** True when two model names refer to the same saved settings row, ignoring any `:precision`. */
export function sameModel(a: string, b: string): boolean {
  return modelSettingsKey(a) === modelSettingsKey(b);
}

/** Engine for a downloaded model. Unknown models are treated as llama.cpp (the GGUF path). */
export function engineOf(model: Pick<ModelInfo, "source"> | undefined): ModelEngine {
  return model?.source === "aihub" ? "qairt" : "llama_cpp";
}

/** Load settings the GenieX server ignores or rejects for this engine and compute target. */
export type LoadSettingKey = "compute" | "nctx" | "ngl" | "spec";

const LLAMA_ONLY = "Applies to llama.cpp (GGUF) models only.";

/**
 * Why a load setting is disabled for this model, or undefined when it applies. Shown as the
 * tooltip on the disabled control.
 */
export function loadSettingDisabledReason(
  key: LoadSettingKey,
  engine: ModelEngine,
  compute: string | undefined,
): string | undefined {
  switch (key) {
    case "compute":
      return engine === "qairt" ? LLAMA_ONLY : undefined;
    case "nctx":
      if (engine === "qairt") {
        return "QAIRT bundles fix the context length when they are compiled. Pull a longer bundle to change it.";
      }
      return undefined;
    case "ngl":
      if (engine === "qairt") return LLAMA_ONLY;
      if (compute === "cpu")
        return "No layers are offloaded on CPU. Choose GPU or NPU to use this.";
      return undefined;
    case "spec":
      return engine === "qairt" ? LLAMA_ONLY : undefined;
  }
}

/** Why the draft model field is disabled, or undefined when a draft model applies. */
export function draftModelDisabledReason(
  engine: ModelEngine,
  specType: string | undefined,
): string | undefined {
  if (engine === "qairt") return LLAMA_ONLY;
  if (!specType) return "Choose a speculative decoding type first.";
  if (!usesDraftModel(specType)) return "This type does not use a draft model.";
  return undefined;
}

/**
 * Load parameters for a model's chat requests. Disabled settings are left out so the server
 * default applies instead of a value the engine would ignore. The context window is the saved
 * one, else the model's own (`nativeContext`), else left to the server.
 */
export function resolveLoadParams(
  saved: ModelLoadSettings,
  engine: ModelEngine,
  fallbackCompute: string,
  nativeContext: number | null = null,
): ModelLoadParams {
  const merged = { ...DEFAULT_LOAD_SETTINGS, ...saved };
  const compute = merged.compute || fallbackCompute;
  const params: ModelLoadParams = {};
  const nctx = saved.nctx ?? nativeContext ?? undefined;

  if (!loadSettingDisabledReason("compute", engine, compute)) params.compute = compute;
  if (!loadSettingDisabledReason("nctx", engine, compute) && nctx != null) params.nctx = nctx;
  if (!loadSettingDisabledReason("ngl", engine, compute)) params.ngl = merged.ngl;
  if (merged.powerMode) params.powerMode = merged.powerMode;

  if (saved.specType && !loadSettingDisabledReason("spec", engine, compute)) {
    params.specType = saved.specType;
    if (usesDraftModel(saved.specType) && saved.specDraftModel) {
      params.specDraftModel = saved.specDraftModel;
    }
    if (saved.specNMax != null) params.specNMax = saved.specNMax;
    if (saved.specNMin != null) params.specNMin = saved.specNMin;
    if (saved.specPMin != null) params.specPMin = saved.specPMin;
  }
  return params;
}

/**
 * Settings for one chat send: the sampling settings plus the model's load parameters.
 */
export function chatSettingsFor(
  stored: StoredModelSettings,
  engine: ModelEngine,
  fallbackCompute: string,
  nativeContext: number | null = null,
): ChatSettings {
  const generation: Record<string, unknown> = { ...stored };
  for (const key of [...LEGACY_SERVER_KEYS, ...LOAD_PARAM_KEYS, "systemBlocks"]) {
    delete generation[key];
  }
  return {
    ...(generation as ChatSettings),
    ...resolveLoadParams(stored, engine, fallbackCompute, nativeContext),
  };
}

/** True when two server setting sets would start the same server. */
export function sameServerOptions(a: ServerSettings | null, b: ServerSettings): boolean {
  if (!a) return false;
  return a.origins === b.origins && a.keepalive === b.keepalive;
}

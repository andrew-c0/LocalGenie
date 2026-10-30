import { invoke } from "@tauri-apps/api/core";
import type { ModelRamEstimate } from "../types";
import { modelSettingsKey, sameModel } from "../utils/modelSettings";
import * as db from "./database";

/**
 * RAM estimates for every downloaded model at each precision. `nctx` sets the context window for all
 * of them; omit it to use each model's native context.
 */
export async function getModelRamEstimates(nctx?: number): Promise<ModelRamEstimate[]> {
  return invoke("model_ram_estimates", { nctx });
}

/** The context window a model is saved with, or undefined when it has none of its own. */
async function savedContext(modelName: string): Promise<number | undefined> {
  const settings = await db
    .loadModelSettings(modelSettingsKey(modelName))
    .catch(() => ({ nctx: undefined }));
  return settings.nctx ?? undefined;
}

/**
 * RAM estimate rows for each named model, keyed by model name. Each model is estimated at its saved
 * context window. The backend takes one context per call, so models are grouped by context and each
 * group is asked once.
 */
export async function loadModelRamEstimates(
  modelNames: string[],
): Promise<Record<string, ModelRamEstimate[]>> {
  const contexts = await Promise.all(
    modelNames.map(async (name) => ({ name, nctx: await savedContext(name) })),
  );
  const distinct = [...new Set(contexts.map((entry) => entry.nctx))];
  const rowsByContext = new Map(
    await Promise.all(
      distinct.map(async (nctx) => [nctx, await getModelRamEstimates(nctx)] as const),
    ),
  );
  return Object.fromEntries(
    contexts.map(({ name, nctx }) => [
      name,
      (rowsByContext.get(nctx) ?? []).filter((row) => sameModel(row.name, name)),
    ]),
  );
}

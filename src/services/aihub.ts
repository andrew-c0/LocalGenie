import { invoke } from "@tauri-apps/api/core";

/** The few facts a catalog card shows, from a model's info file (the Rust `AihubCardInfo`). */
export interface AihubCardInfo {
  headline: string;
  /** Size of the model file in bytes. Null when the info has none. */
  modelSizeBytes: number | null;
  /** Quantisation as AI Hub writes it, e.g. `Q4_0 (GGUF)`. */
  quantization: string | null;
  inputModalities: string[];
  outputModalities: string[];
  /** Context lengths as text, e.g. `512, 1024, 4096`. */
  contextLengths: string | null;
  /** Supported languages as text. */
  languages: string | null;
}

/** One technical detail of a model, the value as text (the Rust `AihubDetail`). */
export interface AihubDetail {
  key: string;
  value: string;
}

/** One QAIRT model in the Qualcomm AI Hub catalog (list row; the Rust `AihubCatalogEntry`). */
export interface AihubCatalogEntry {
  id: string;
  displayName: string;
  /** Proto enum label without its prefix, e.g. `GENERATIVE_AI`. */
  domain: string;
  useCase: string;
  isQuantized: boolean;
  runtimes: string[];
  chipsets: string[];
  tags: string[];
  /** Card facts from the model's info file. Null when that file could not be read. */
  summary: AihubCardInfo | null;
}

/** One QAIRT asset (zip) of a model. `chipset` is null for an asset not tied to one chipset. */
export interface AihubAsset {
  precision: string;
  chipset: string | null;
  downloadUrl: string;
}

/** Model info plus its QAIRT assets (the Rust `AihubModelDetail`). `assets` is null when the release
 *  assets could not be read; the model info is still there. */
export interface AihubModelDetail {
  id: string;
  name: string;
  headline: string;
  description: string;
  domain: string;
  useCase: string;
  licenseType: string;
  licenseUrl: string | null;
  sourceRepo: string | null;
  restrictModelSharing: boolean;
  callToAction: string | null;
  tags: string[];
  /** Technical details of the model (top-level and runtime 11/12 values, one entry per key). */
  technicalDetails: AihubDetail[];
  researchPaper: string | null;
  researchPaperTitle: string | null;
  applicableScenarios: string[];
  /** Genie (QNN context binary) support. Null when the model has no LLM details. */
  genieCompatible: boolean | null;
  /** GenieX llama.cpp (GGUF) support. Null when the model has no LLM details. */
  geniexLlamacppCompatible: boolean | null;
  assets: AihubAsset[] | null;
}

/** QAIRT models in the catalog. */
export async function aihubListModels(): Promise<AihubCatalogEntry[]> {
  return invoke("aihub_list_models");
}

/** Detail and QAIRT assets for one model id. */
export async function aihubModelDetail(id: string): Promise<AihubModelDetail> {
  return invoke("aihub_model_detail", { id });
}

/** Raw model card (README). Resolves to null when the model has none. */
export async function aihubModelReadme(id: string): Promise<string | null> {
  return invoke("aihub_model_readme", { id });
}

/** Import a QAIRT zip that was downloaded to `folder`/`zipName` (inside Downloads) into the GenieX
 *  cache as `modelName` (`qualcomm/<name>`), then delete the zip. `facets` is JSON text or null. */
export async function importAihubZip(
  folder: string,
  zipName: string,
  modelName: string,
  precision: string,
  facets: string | null,
): Promise<void> {
  return invoke("import_aihub_zip", { folder, zipName, modelName, precision, facets });
}

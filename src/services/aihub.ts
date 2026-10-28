import { invoke } from "@tauri-apps/api/core";

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
  assets: AihubAsset[] | null;
}

/** Catalog release used for every read (probed once per session in Rust). */
export async function aihubLatestVersion(): Promise<string> {
  return invoke("aihub_latest_version");
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

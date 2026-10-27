import { invoke } from "@tauri-apps/api/core";

/** Download a file into `folder` inside the Downloads folder. Resumes from a partial file if one
 *  exists, and returns the existing file when it is already complete.
 *  Progress arrives as `download-progress` events keyed by `downloadId`.
 *  Returns the path to the downloaded file. */
export async function downloadFile(
  downloadId: string,
  url: string,
  folder: string,
  fileName: string,
): Promise<string> {
  return invoke("download_file", { downloadId, url, folder, fileName });
}

/** Stop an in-flight download. The partial file is kept so it can be resumed. */
export async function cancelDownload(downloadId: string): Promise<void> {
  return invoke("cancel_download", { downloadId });
}

/** Import a downloaded GGUF into the GenieX model cache. `folder` is the repo's download folder
 *  (inside Downloads), holding `filename` and the projector `sidecarNames`. They are registered with
 *  `geniex pull --model-hub localfs`, and the files this import used are removed after GenieX has
 *  copied them. `facets` is the repo's facet summary as JSON text, stored with the model. */
export async function importGGUF(
  folder: string,
  repoId: string,
  filename: string,
  precision: string,
  sidecarNames: string[],
  facets: string | null,
): Promise<void> {
  return invoke("import_gguf", { folder, repoId, filename, precision, sidecarNames, facets });
}

import { invoke } from "@tauri-apps/api/core";

/** Download a file into the Downloads folder. Resumes from a partial file if one exists.
 *  Progress arrives as `download-progress` events keyed by `downloadId`.
 *  Returns the path to the downloaded file. */
export async function downloadFile(
  downloadId: string,
  url: string,
  fileName: string,
): Promise<string> {
  return invoke("download_file", { downloadId, url, fileName });
}

/** Stop an in-flight download. The partial file is kept so it can be resumed. */
export async function cancelDownload(downloadId: string): Promise<void> {
  return invoke("cancel_download", { downloadId });
}

/** Import a downloaded GGUF file into the GenieX model cache.
 *  The file is moved into a folder named after the base model, then registered with
 *  `geniex pull --model-hub localfs`. Returns that folder. */
export async function importGGUF(
  localPath: string,
  repoId: string,
  filename: string,
  precision: string,
): Promise<string> {
  return invoke("import_gguf", { localPath, repoId, filename, precision });
}

/** Delete a folder or file inside the Downloads folder. */
export async function deleteDirectory(path: string): Promise<void> {
  return invoke("delete_directory", { path });
}

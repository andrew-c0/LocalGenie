import { invoke } from "@tauri-apps/api/core";

/** Download a file to the user's Downloads directory via the Rust backend.
 *  Resumes automatically from a partial file if one exists.
 *  Returns the path to the downloaded file. */
export async function downloadFile(
  url: string,
  fileName: string,
  precision?: string,
): Promise<string> {
  return invoke("download_file", { url, fileName, precision }) as Promise<string>;
}

/** Import a GGUF file (already downloaded) into the GenieX model cache.
 *  Runs `geniex pull --model-hub localfs --local-path <path>` to register it.
 *  Emits `model-pull-start/progress/complete` events for the downloads drawer. */
export async function importGGUF(
  localPath: string,
  repoId: string,
  filename: string,
  precision: string,
): Promise<void> {
  return invoke("import_gguf", { localPath, repoId, filename, precision });
}

/** Remove a file from the Downloads folder after successful import. */
export async function cleanupDownloadedFile(path: string): Promise<void> {
  return invoke("delete_file", { path });
}

export async function cancelDownload(fileName: string): Promise<void> {
  return invoke("cancel_download", { fileName });
}

export async function deleteFile(path: string): Promise<void> {
  return invoke("delete_file", { path });
}

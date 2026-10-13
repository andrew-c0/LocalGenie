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
 *  After the file is downloaded, it is moved to a folder named after the base
 *  model name, then imported via `geniex pull --model-hub localfs --local-path`.
 *  Emits `model-pull-start/progress/complete` events for the downloads drawer. */
export async function importGGUF(
  localPath: string,
  repoId: string,
  filename: string,
  precision: string,
): Promise<string> {
  try {
    return (await invoke("import_gguf", { localPath, repoId, filename, precision })) as string;
  } catch (err) {
    console.error("GGUF import failed:", err);
    throw err;
  }
}

/** Remove the model directory from Downloads after successful import. */
export async function cleanupDownloadedModelDirectory(path: string): Promise<void> {
  return invoke("delete_directory", { path });
}

export async function cancelDownload(fileName: string): Promise<void> {
  return invoke("cancel_download", { fileName });
}

export async function deleteDirectory(path: string): Promise<void> {
  return invoke("delete_directory", { path });
}

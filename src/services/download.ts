import { invoke } from "@tauri-apps/api/core";

/** Download a file to the user's Downloads directory via the Rust backend. */
export async function downloadFile(url: string, fileName: string): Promise<string> {
  return invoke("download_file", { url, fileName });
}

/** Delete a downloaded file (e.g. after a successful model pull). */
export async function deleteFile(path: string): Promise<void> {
  return invoke("delete_file", { path });
}

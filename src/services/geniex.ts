import { invoke } from "@tauri-apps/api/core";
import type {
  AihubModel,
  ConfigEntry,
  GenerationSettings,
  ModelInfo,
  SearchModel,
  ServerLogLine,
  ServerStartOptions,
  ServerStatus,
  UpdateInfo,
} from "../types/index";

/** Shape sent to the OpenAI-compatible chat completions endpoint. */
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// ─── Model Management ────────────────────────────────────────────

export async function listModels(): Promise<ModelInfo[]> {
  return invoke("list_models");
}

export async function removeModel(model: string): Promise<void> {
  return invoke("remove_model", { model });
}

export async function cleanModels(): Promise<void> {
  return invoke("clean_models");
}

export async function setModelType(model: string, modelType: string): Promise<void> {
  return invoke("set_model_type", { model, modelType });
}

export async function searchModels(query: string): Promise<SearchModel[]> {
  return invoke("search_models", { query });
}

/** Qualcomm AI Hub models that GenieX can run on this chipset (`geniex model list`). */
export async function listAihubModels(): Promise<AihubModel[]> {
  return invoke("list_aihub_models");
}

// ─── Server Management ───────────────────────────────────────────

export async function startServer(options?: ServerStartOptions): Promise<ServerStatus> {
  return invoke("start_server", { options: options ?? {} });
}

export async function stopServer(port?: number): Promise<ServerStatus> {
  return invoke("stop_server", { port });
}

/** Base URL of the GenieX server on this machine. Every frontend caller builds URLs through this. */
export function serverBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/** True when something answers `/v1/models` on the local port. Used to check a port before use. */
export async function isPortServing(port: number, signal?: AbortSignal): Promise<boolean> {
  const resp = await fetch(`${serverBaseUrl(port)}/v1/models`, { method: "GET", signal });
  return resp.ok;
}

export async function getServerStatus(port?: number): Promise<ServerStatus> {
  return invoke("get_server_status", { port });
}

// ─── Model Loading ──────────────────────────────────────────────

export async function loadModel(model: string, baseUrl?: string): Promise<ServerStatus> {
  return invoke("load_model", { model, baseUrl });
}

export async function unloadAllModels(port?: number): Promise<ServerStatus> {
  return invoke("unload_all_models", { port });
}

// ─── Chat ────────────────────────────────────────────────────────

/**
 * Stream a chat completion. Chunks and completion arrive as `chat-chunk` and
 * `chat-done` events carrying `streamId`, so the caller can route them to the
 * session that started the stream.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  settings: GenerationSettings,
  streamId: string,
  model?: string,
  baseUrl?: string,
): Promise<void> {
  return invoke("chat_completion", { messages, settings, streamId, model, baseUrl });
}

// ─── CLI Utilities ──────────────────────────────────────────────
export async function checkGeniexInstalled(): Promise<boolean> {
  return invoke("check_geniex_installed");
}
export async function checkForCliUpdate(): Promise<UpdateInfo> {
  return invoke("check_for_cli_update");
}

export async function configGet(key: string): Promise<string | null> {
  return invoke("config_get", { key });
}

export async function configSet(key: string, value?: string): Promise<void> {
  return invoke("config_set", { key, value });
}

export async function configList(): Promise<ConfigEntry[]> {
  return invoke("config_list");
}

/** Request the in-flight chat completion to stop at the next chunk boundary. */
export async function cancelChatCompletion(): Promise<void> {
  return invoke("cancel_chat_completion");
}

export async function updateGeniex(): Promise<string> {
  return invoke("update_geniex");
}

// ─── Server Logs ─────────────────────────────────────────────────

/** Recent `geniex serve` output, oldest first. */
export async function getServerLogs(): Promise<ServerLogLine[]> {
  return invoke("get_server_logs");
}

export async function clearServerLogs(): Promise<void> {
  return invoke("clear_server_logs");
}

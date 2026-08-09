import { invoke } from "@tauri-apps/api/core";
import type {
  GenerationSettings,
  ModelInfo,
  SearchModel,
  ServerStatus,
  ConfigEntry,
  ServerStartOptions,
  UpdateInfo,
} from "../types";

/** Shape sent to the OpenAI-compatible chat completions endpoint. */
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// ─── Model Management ────────────────────────────────────────────

export async function listModels(): Promise<ModelInfo[]> {
  return invoke("list_models");
}

export async function pullModel(
  model: string,
  precision?: string,
  modelHub?: string,
  modelType?: string,
  localPath?: string,
): Promise<void> {
  return invoke("pull_model", {
    model,
    precision,
    modelHub,
    modelType,
    localPath,
  });
}

export async function removeModel(model: string): Promise<void> {
  return invoke("remove_model", { model });
}

export async function cleanModels(): Promise<void> {
  return invoke("clean_models");
}

export async function setModelType(
  model: string,
  modelType: string,
): Promise<void> {
  return invoke("set_model_type", { model, modelType });
}

export async function searchModels(query: string): Promise<SearchModel[]> {
  return invoke("search_models", { query });
}

// ─── Server Management ───────────────────────────────────────────

export async function startServer(
  options?: ServerStartOptions,
): Promise<ServerStatus> {
  return invoke("start_server", {
    port: options?.port,
    compute: options?.compute,
    nctx: options?.nctx,
    ngl: options?.ngl,
    origins: options?.origins,
    keepalive: options?.keepalive,
  });
}

export async function stopServer(port?: number): Promise<ServerStatus> {
  return invoke("stop_server", { port });
}

export async function getServerStatus(port?: number): Promise<ServerStatus> {
  return invoke("get_server_status", { port });
}

// ─── Model Loading ──────────────────────────────────────────────

export async function loadModel(
  model: string,
  baseUrl?: string,
): Promise<ServerStatus> {
  return invoke("load_model", { model, baseUrl });
}

export async function unloadAllModels(): Promise<ServerStatus> {
  return invoke("unload_all_models");
}

// ─── Chat ────────────────────────────────────────────────────────

export async function chatCompletion(
  messages: ChatMessage[],
  settings: GenerationSettings,
  model?: string,
  baseUrl?: string,
): Promise<void> {
  return invoke("chat_completion", { messages, settings, model, baseUrl });
}

// ─── CLI Utilities ──────────────────────────────────────────────
export async function checkGeniexInstalled(): Promise<boolean> {
  return invoke("check_geniex_installed");
}
export async function getGeniexVersion(): Promise<string> {
  return invoke("get_geniex_version");
}

export async function checkForCliUpdate(): Promise<UpdateInfo> {
  return invoke("check_for_cli_update");
}

export async function configGet(key: string): Promise<string | null> {
  return invoke("config_get", { key });
}

export async function configSet(
  key: string,
  value?: string,
): Promise<void> {
  return invoke("config_set", { key, value });
}

export async function configList(): Promise<ConfigEntry[]> {
  return invoke("config_list");
}

export async function updateGeniex(): Promise<string> {
  return invoke("update_geniex");
}

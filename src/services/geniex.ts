import { invoke } from "@tauri-apps/api/core";
import type {
  ChatMessageContent,
  ChatSettings,
  ChatToolCallsEvent,
  ConfigEntry,
  ModelInfo,
  ModelLoadParams,
  RuntimeVersions,
  SearchModel,
  ServerLogLine,
  ServerStartOptions,
  ServerStatus,
  ToolDefinition,
} from "../types";
import { listenEvent } from "./events";

/** A tool call inside an assistant message sent to the server (OpenAI wire shape). */
export interface ToolCallWire {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** Shape sent to the OpenAI-compatible chat completions endpoint. Snake_case on the wire, as OpenAI names them. */
export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: ChatMessageContent;
  /** Set on an assistant message that made tool calls. */
  tool_calls?: ToolCallWire[];
  /** Set on a `tool` message: the id of the call it answers. */
  tool_call_id?: string;
  name?: string;
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

/** Load a model with the given parameters. They must match the ones chat requests send. */
export async function loadModel(
  model: string,
  load?: ModelLoadParams,
  baseUrl?: string,
): Promise<ServerStatus> {
  return invoke("load_model", { model, baseUrl, load });
}

export async function unloadAllModels(port?: number): Promise<ServerStatus> {
  return invoke("unload_all_models", { port });
}

// ─── Chat ────────────────────────────────────────────────────────

/**
 * Stream a chat completion. Chunks and completion arrive as `chat-chunk` and
 * `chat-done` events carrying `streamId`, so the caller can route them to the
 * session that started the stream. `chat-done` also carries `finishReason`
 * (the server's value, `"cancelled"` on user stop, or null). The stream runs
 * until it finishes; there is no app-side token cap or total timeout.
 *
 * `tools` (optional) offers OpenAI tool objects to the model. When the model calls
 * them, `chat-tool-calls` arrives just before `chat-done` (finishReason `"tool_calls"`).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  settings: ChatSettings,
  streamId: string,
  model?: string,
  baseUrl?: string,
  tools?: ToolDefinition[],
): Promise<void> {
  return invoke("chat_completion", { messages, settings, streamId, model, baseUrl, tools });
}

/** Event carrying `ChatToolCallsEvent` when the model calls tools in a streamed reply. */
export const CHAT_TOOL_CALLS_EVENT = "chat-tool-calls";

/** Subscribe to `chat-tool-calls`. Resolves to a function that removes the listener. */
export function listenChatToolCalls(
  handler: (payload: ChatToolCallsEvent) => void,
): Promise<() => void> {
  return listenEvent<ChatToolCallsEvent>(CHAT_TOOL_CALLS_EVENT, handler);
}

// ─── CLI Utilities ──────────────────────────────────────────────

/** llama.cpp runtime hash and QAIRT version from `geniex version`. */
export async function getRuntimeVersions(): Promise<RuntimeVersions> {
  return invoke("get_runtime_versions");
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

// ─── Server Logs ─────────────────────────────────────────────────

/** Recent `geniex serve` output, oldest first. */
export async function getServerLogs(): Promise<ServerLogLine[]> {
  return invoke("get_server_logs");
}

export async function clearServerLogs(): Promise<void> {
  return invoke("clear_server_logs");
}

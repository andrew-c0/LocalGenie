import { invoke } from "@tauri-apps/api/core";
import type { ChatSession, GenerationStats, Message, ServerSettings } from "../types";
import { chatErrorContent } from "../utils/chatError";
import { DEFAULT_SERVER_SETTINGS } from "../utils/modelSettings";

/** Valid message roles — used to validate DB values at runtime. */
const VALID_ROLES = new Set<Message["role"]>(["user", "assistant", "system"]);

function toValidRole(raw: string): Message["role"] {
  return VALID_ROLES.has(raw as Message["role"]) ? (raw as Message["role"]) : "assistant";
}

// ─── Sessions ────────────────────────────────────────────────────

/** Shape returned by the Rust backend. */
interface DbSessionWithMessages {
  id: string;
  title: string;
  model_id: string | null;
  context_chars: number;
  created_at: number;
  updated_at: number;
  messages: DbMessageRow[];
  errors: DbChatErrorRow[];
}

interface DbMessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  model_id: string | null;
  created_at: number;
  finish_reason: string | null;
  time_to_first_token_ms: number | null;
  total_time_ms: number | null;
  token_count: number | null;
  prompt_chars: number | null;
}

/** Builds `GenerationStats` from a message row. Undefined unless all four columns are set (older rows have none). */
function toGenerationStats(m: DbMessageRow): GenerationStats | undefined {
  if (
    m.time_to_first_token_ms === null ||
    m.total_time_ms === null ||
    m.token_count === null ||
    m.prompt_chars === null
  ) {
    return undefined;
  }
  return {
    timeToFirstToken: m.time_to_first_token_ms,
    totalTime: m.total_time_ms,
    tokenCount: m.token_count,
    promptChars: m.prompt_chars,
  };
}

/** Row of `chat_errors`. `message_id` is null when the error had no reply. */
interface DbChatErrorRow {
  id: string;
  session_id: string;
  message_id: string | null;
  error: string;
  created_at: number;
}

export async function loadSessions(): Promise<ChatSession[]> {
  const rows: DbSessionWithMessages[] = await invoke("load_sessions");
  return rows.map((row) => {
    const messages: Message[] = row.messages.map((m) => ({
      id: m.id,
      role: toValidRole(m.role),
      content: m.content,
      modelId: m.model_id ?? undefined,
      timestamp: m.created_at,
      finishReason: m.finish_reason ?? undefined,
      stats: toGenerationStats(m),
    }));
    // Errors come back as their own rows; show them in time order, after the reply they belong to.
    const errors: Message[] = row.errors.map((e) => ({
      id: e.id,
      role: "assistant",
      content: chatErrorContent(e.error),
      timestamp: e.created_at,
      isError: true,
    }));
    return {
      id: row.id,
      title: row.title,
      modelId: row.model_id ?? undefined,
      contextChars: row.context_chars,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Array sort is stable, so on equal timestamps the stored message stays first.
      messages: [...messages, ...errors].sort((a, b) => a.timestamp - b.timestamp),
    };
  });
}

export async function saveSession(session: ChatSession): Promise<void> {
  await invoke("save_session", {
    session: {
      id: session.id,
      title: session.title,
      model_id: session.modelId ?? null,
      context_chars: session.contextChars,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
    },
  });
}

export async function deleteSession(id: string): Promise<void> {
  await invoke("delete_session", { id });
}

export async function deleteMessage(id: string): Promise<void> {
  await invoke("delete_message", { id });
}

// ─── Messages ────────────────────────────────────────────────────

export async function saveMessage(sessionId: string, message: Message): Promise<void> {
  await invoke("save_message", {
    sessionId,
    message: {
      id: message.id,
      session_id: sessionId,
      role: message.role,
      content: message.content,
      model_id: message.modelId ?? null,
      created_at: message.timestamp,
      finish_reason: message.finishReason ?? null,
      time_to_first_token_ms: message.stats?.timeToFirstToken ?? null,
      total_time_ms: message.stats?.totalTime ?? null,
      token_count: message.stats?.tokenCount ?? null,
      prompt_chars: message.stats?.promptChars ?? null,
    },
  });
}

/** A chat error to persist. `messageId` is the reply it belongs to, or null if there was no reply. */
export interface ChatErrorInput {
  id: string;
  messageId: string | null;
  error: string;
  timestamp: number;
}

export async function saveChatError(sessionId: string, error: ChatErrorInput): Promise<void> {
  await invoke("save_chat_error", {
    error: {
      id: error.id,
      session_id: sessionId,
      message_id: error.messageId,
      error: error.error,
      created_at: error.timestamp,
    },
  });
}

export async function deleteChatError(id: string): Promise<void> {
  await invoke("delete_chat_error", { id });
}

// ─── Model Settings ──────────────────────────────────────────────

export async function loadModelSettings(modelId: string): Promise<string | null> {
  return invoke("load_model_settings", { modelId });
}

export async function saveModelSettings(modelId: string, settings: string): Promise<void> {
  await invoke("save_model_settings", { modelId, settings });
}

// ─── User Preferences ──────────────────────────────────────────

export async function getPreference<T = string>(key: string): Promise<T | null> {
  const raw: string | null = await invoke("get_preference", { key });
  if (raw === null) return null;

  // Values are stored as JSON. Rows written before that are plain text, so fall back to the raw string.
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

/** Store a preference as JSON, so `getPreference` returns the same type it was given. */
export async function setPreference(key: string, value: unknown, type = "string"): Promise<void> {
  await invoke("set_preference", { key, value: JSON.stringify(value), prefType: type });
}

/** App-wide server settings (Application & Runtime). Falls back to the defaults when unset. */
export async function getServerSettings(): Promise<ServerSettings> {
  const origins = await getPreference<string>("server_origins").catch(() => null);
  const keepalive = await getPreference<number>("server_keepalive").catch(() => null);
  return {
    origins: origins ?? DEFAULT_SERVER_SETTINGS.origins,
    keepalive: keepalive ?? DEFAULT_SERVER_SETTINGS.keepalive,
  };
}

export async function saveServerSettings(settings: ServerSettings): Promise<void> {
  await setPreference("server_origins", settings.origins, "string");
  await setPreference("server_keepalive", settings.keepalive, "number");
}

// ─── Downloaded model metadata ─────────────────────────────────────

/** Row returned by the Rust backend. */
export interface DbDownloadedModel {
  name: string;
  precision: string | null;
  context_size: number | null;
  param_count: number | null;
  repo_url: string | null;
  model_card: string | null;
}

export async function listDownloadedModels(): Promise<DbDownloadedModel[]> {
  return invoke("list_downloaded_models");
}

export async function upsertDownloadedModel(
  name: string,
  precision: string | null,
  contextSize: number | null,
  paramCount: number | null,
  repoUrl?: string | null,
  modelCard?: string | null,
): Promise<void> {
  const params: Record<string, unknown> = { name, precision, contextSize, paramCount };
  if (repoUrl !== undefined) params.repoUrl = repoUrl;
  if (modelCard !== undefined) params.modelCard = modelCard;
  await invoke("upsert_downloaded_model", params);
}

export async function deleteDownloadedModel(name: string): Promise<void> {
  await invoke("delete_downloaded_model", { name });
}

import { invoke } from "@tauri-apps/api/core";
import type { ChatSession, Message } from "../types";

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
}

interface DbMessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  model_id: string | null;
  created_at: number;
}

export async function loadSessions(): Promise<ChatSession[]> {
  const rows: DbSessionWithMessages[] = await invoke("load_sessions");
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    modelId: row.model_id ?? undefined,
    contextChars: row.context_chars,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: row.messages.map((m) => ({
      id: m.id,
      role: toValidRole(m.role),
      content: m.content,
      modelId: m.model_id ?? undefined,
      timestamp: m.created_at,
    })),
  }));
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
    },
  });
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

  // The Rust side returns the raw string; we infer the type from context.
  // Try to parse as number, then boolean, then JSON, then return as string.
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== "") return num as T;
  if (raw === "true") return true as T;
  if (raw === "false") return false as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

export async function setPreference(key: string, value: unknown, type = "string"): Promise<void> {
  const strValue = typeof value === "string" ? value : JSON.stringify(value);
  await invoke("set_preference", { key, value: strValue, prefType: type });
}

// ─── Downloaded model metadata ─────────────────────────────────────

/** Row returned by the Rust backend. */
export interface DbDownloadedModel {
  name: string;
  precision: string | null;
  context_size: number | null;
  param_count: number | null;
}

export async function listDownloadedModels(): Promise<DbDownloadedModel[]> {
  return invoke("list_downloaded_models");
}

export async function upsertDownloadedModel(
  name: string,
  precision: string | null,
  contextSize: number | null,
  paramCount: number | null,
): Promise<void> {
  await invoke("upsert_downloaded_model", { name, precision, contextSize, paramCount });
}

export async function deleteDownloadedModel(name: string): Promise<void> {
  await invoke("delete_downloaded_model", { name });
}

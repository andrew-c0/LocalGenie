import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import type { Message } from "../types";
import { engineOf, modelSettingsKey, resolveLoadParams } from "../utils/modelSettings";
import {
  alreadyShown,
  isModelChange,
  isSystemEvent,
  MODEL_CHANGED,
  modelChangedContent,
  type ReplyTarget,
} from "../utils/systemEvents";
import * as db from "./database";

/**
 * The model and compute target a prompt sent now will run on, resolved the same way as the send:
 * the model's saved load settings, else the header's compute target.
 */
export async function sendTargetFor(model: string): Promise<ReplyTarget> {
  const key = modelSettingsKey(model);
  let saved = {};
  let nativeContext: number | null = null;
  try {
    saved = await db.loadModelSettings(key);
    nativeContext = await db.loadNativeContext(key);
  } catch {
    // Without saved settings the header's compute target applies.
  }
  const info = useModelStore.getState().models.find((m) => modelSettingsKey(m.name) === key);
  const params = resolveLoadParams(
    saved,
    engineOf(info),
    useModelStore.getState().compute,
    nativeContext,
  );
  return { model, compute: params.compute ?? null };
}

/**
 * The line to show before `prompt` when the model or compute target differs from the last reply in
 * `earlier` (the messages before the prompt). Null when nothing changed, or when no reply came before
 * the prompt. The line is dated just before the prompt, so it sorts above it.
 */
export function modelChangeLine(
  earlier: Message[],
  target: ReplyTarget,
  prompt: Message,
): Message | null {
  if (alreadyShown(earlier, target)) return null;
  const last = [...earlier]
    .reverse()
    .find((m) => m.role === "assistant" && !m.isError && !isSystemEvent(m) && m.modelId);
  if (!last?.modelId) return null;
  if (!isModelChange({ model: last.modelId, compute: last.compute ?? null }, target)) return null;

  return {
    id: crypto.randomUUID(),
    role: "system",
    kind: "system",
    systemType: MODEL_CHANGED,
    content: modelChangedContent(target.model, target.compute),
    timestamp: prompt.timestamp - 1,
  };
}

/** Stores a system line, in the conversation and in the database. It goes before `beforeId`, or at the end. */
export function saveSystemLine(sessionId: string, line: Message, beforeId: string | null): void {
  const chat = useChatStore.getState();
  if (beforeId === null) chat.addMessage(sessionId, line);
  else chat.insertMessageBefore(sessionId, beforeId, line);
  void db.saveMessage(sessionId, line).catch(() => {});
}

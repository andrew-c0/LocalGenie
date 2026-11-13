import { messagesOf, overridesOf, useChatStore } from "../stores/chatStore";
import { defaultSettings, useModelStore } from "../stores/modelStore";
import type {
  ChatSettings,
  Message,
  ModelLoadParams,
  StoredModelSettings,
  SystemPromptBlock,
  ToolDefinition,
} from "../types";
import { chatErrorContent } from "../utils/chatError";
import { applyChatOverrides } from "../utils/chatOverrides";
import { latestSummary, systemPromptWithSummary } from "../utils/compaction";
import {
  chatSettingsFor,
  contextWindowFor,
  engineOf,
  modelSettingsKey,
  resolveLoadParams,
} from "../utils/modelSettings";
import {
  composeSystemPrompt,
  localTimeZone,
  type PlatformSnapshot,
  withSystemBlocks,
} from "../utils/systemPrompt";
import { toast } from "../utils/toast";
import { isReplyMessage } from "../utils/toolRecords";
import * as db from "./database";
import * as geniex from "./geniex";
import * as systemService from "./system";

/** Everything one request needs from the active model and the chat. */
export interface ModelRun {
  /** The active model, or null when none is loaded. */
  modelId: string | null;
  /** Sampling and load settings of the request. The system prompt is added per request. */
  settings: ChatSettings;
  /** The load parameters alone. The summary call repeats them so the model is not reloaded. */
  load: ModelLoadParams;
  systemBlocks: SystemPromptBlock[];
  /** The window the chat shows for the model, in tokens. Null when it is not known. */
  contextWindow: number | null;
}

/** A request that failed. `reply` is the partial reply it produced before failing, if any. */
export interface SendFailure {
  error: string;
  reply?: Message;
}

/** Platform details for a send: the OS probe plus the startup chipset. Null when the probe fails. */
async function platformForSend(): Promise<PlatformSnapshot | null> {
  try {
    const info = await systemService.getPlatformInfo();
    return { ...info, chipset: useModelStore.getState().chipset };
  } catch {
    return null;
  }
}

/** Last message in a session, read from the store. */
function lastMessageOf(sessionId: string): Message | undefined {
  const messages = messagesOf(sessionId);
  return messages[messages.length - 1];
}

/** The saved settings and native context of a model. Defaults when there is no model or they cannot be read. */
async function savedSettingsFor(
  key: string | null,
): Promise<{ saved: Partial<StoredModelSettings>; nativeContext: number | null }> {
  if (!key) return { saved: {}, nativeContext: null };
  try {
    return {
      saved: await db.loadModelSettings(key),
      nativeContext: await db.loadNativeContext(key),
    };
  } catch {
    return { saved: {}, nativeContext: null };
  }
}

/** The model, its settings and the chat's overrides, resolved the same way for every request of a send. */
export async function resolveModelRun(sessionId: string): Promise<ModelRun> {
  const modelId = useModelStore.getState().activeModelId;
  const key = modelId ? modelSettingsKey(modelId) : null;
  const { saved, nativeContext } = await savedSettingsFor(key);
  // The chat's own overrides replace the model's settings for this conversation.
  const stored = applyChatOverrides(
    withSystemBlocks({ ...defaultSettings, ...saved }),
    overridesOf(sessionId),
  );
  const model = key
    ? useModelStore.getState().models.find((m) => modelSettingsKey(m.name) === key)
    : undefined;
  const engine = engineOf(model);
  const compute = useModelStore.getState().compute;
  return {
    modelId,
    settings: chatSettingsFor(stored, engine, compute, nativeContext),
    load: resolveLoadParams(stored, engine, compute, nativeContext),
    systemBlocks: stored.systemBlocks ?? [],
    contextWindow: contextWindowFor(saved, nativeContext),
  };
}

/**
 * The settings of one request: the run's settings with the system prompt. The prompt is composed from
 * the model's blocks, with the newest summary of the conversation as its own block.
 */
async function requestSettingsFor(sessionId: string, run: ModelRun): Promise<ChatSettings> {
  const composed = await composeSystemPrompt(run.systemBlocks, {
    now: new Date(),
    timeZone: localTimeZone(),
    platform: await platformForSend(),
    readFile: systemService.readTextFile,
  });
  if (composed.skipped.length > 0) {
    toast.info(
      "Attached file skipped",
      `Could not read ${composed.skipped.join(", ")}. The reply uses the rest of the system prompt.`,
    );
  }
  const summary = latestSummary(messagesOf(sessionId))?.content ?? null;
  return { ...run.settings, systemPrompt: systemPromptWithSummary(composed.prompt, summary) };
}

/**
 * Longest wait for a stream's `chat-done` after its request resolved. The event normally arrives first;
 * this only keeps a missing event from holding the send open.
 */
const STREAM_END_WAIT_MS = 5000;

/**
 * Resolves once the stream is no longer the active one, which `chat-done` causes. The request's result
 * and the stream's events travel separately, so the reply is only complete after this.
 */
function waitForStreamEnd(streamId: string): Promise<void> {
  return new Promise((resolve) => {
    const isActive = () => useChatStore.getState().activeStream?.streamId === streamId;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    const finish = () => {
      unsubscribe?.();
      clearTimeout(timer);
      resolve();
    };
    if (!isActive()) {
      finish();
      return;
    }
    unsubscribe = useChatStore.subscribe(() => {
      if (!isActive()) finish();
    });
    timer = setTimeout(finish, STREAM_END_WAIT_MS);
  });
}

/**
 * Sends one request and streams its reply into the conversation. `tools` (optional) offers tool
 * definitions to the model. Resolves with null on success, or with the failure (the partial reply is
 * saved first).
 */
export async function streamReply(
  sessionId: string,
  history: geniex.ChatMessage[],
  run: ModelRun,
  tools?: ToolDefinition[],
): Promise<SendFailure | null> {
  const chat = useChatStore.getState();
  chat.setStreaming(true);
  chat.setLastSendTime(Date.now());
  const streamId = crypto.randomUUID();
  chat.setActiveStream({ streamId, sessionId });
  // A reply has started only if a message newer than this one appears during the send.
  const priorLastId = lastMessageOf(sessionId)?.id;

  try {
    const settings = await requestSettingsFor(sessionId, run);
    // The reply records the compute target it was generated on.
    chat.setActiveStream({ streamId, sessionId, compute: settings.compute });
    await geniex.chatCompletion(
      history,
      settings,
      streamId,
      run.modelId ?? undefined,
      geniex.serverBaseUrl(useModelStore.getState().serverPort),
      tools,
    );
    await waitForStreamEnd(streamId);
    return null;
  } catch (err) {
    console.error("Chat completion failed:", err);
    const error = String(err);
    // The reply in progress, if this send produced one. Its partial text is saved so the error has a stored parent.
    const last = lastMessageOf(sessionId);
    const reply = last && isReplyMessage(last) && last.id !== priorLastId ? last : undefined;
    if (reply) db.saveMessage(sessionId, reply).catch(() => {});
    useChatStore.getState().setActiveStream(null);
    useChatStore.getState().setStreaming(false);
    return { error, reply };
  }
}

/**
 * Shows a failed send in the chat, as an error line, and stores it so a reload restores it. The error
 * stays out of `messages`, so it is not stored twice.
 */
export function showChatError(sessionId: string, failure: SendFailure): void {
  toast.error("Reply failed", failure.error);
  const timestamp = Date.now();
  const errorMsg: Message = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: chatErrorContent(failure.error),
    timestamp,
    isError: true,
  };
  useChatStore.getState().addMessage(sessionId, errorMsg);
  db.saveChatError(sessionId, {
    id: errorMsg.id,
    messageId: failure.reply?.id ?? null,
    error: failure.error,
    timestamp,
  }).catch(() => {});
}

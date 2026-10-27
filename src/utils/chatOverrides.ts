import type { ChatSettingsOverrides, StoredModelSettings } from "../types";

/**
 * The settings a chat can override. Load settings and model-specific ones are not here: a chat can
 * switch models, and changing a load setting reloads the model.
 */
export const CHAT_OVERRIDE_KEYS = [
  "temperature",
  "topP",
  "topK",
  "minP",
  "repetitionPenalty",
  "maxTokens",
  "seed",
  "systemBlocks",
] as const satisfies readonly (keyof ChatSettingsOverrides)[];

/** The model's settings with a chat's overrides on top. A key the chat does not set keeps the model's value. */
export function applyChatOverrides(
  stored: StoredModelSettings,
  overrides: ChatSettingsOverrides | undefined,
): StoredModelSettings {
  if (!overrides) return stored;
  const merged: Record<string, unknown> = { ...stored };
  for (const key of CHAT_OVERRIDE_KEYS) {
    if (overrides[key] !== undefined) merged[key] = overrides[key];
  }
  return merged as StoredModelSettings;
}

/** Keeps only the keys a chat sets, so stored overrides never hold empty entries. */
export function cleanOverrides(overrides: ChatSettingsOverrides): ChatSettingsOverrides {
  const clean: Record<string, unknown> = {};
  for (const key of CHAT_OVERRIDE_KEYS) {
    if (overrides[key] !== undefined) clean[key] = overrides[key];
  }
  return clean as ChatSettingsOverrides;
}

/** How many settings a chat overrides. */
export function overrideCount(overrides: ChatSettingsOverrides | undefined): number {
  return overrides ? Object.keys(cleanOverrides(overrides)).length : 0;
}

/**
 * Reads the overrides stored with a conversation. A missing, unreadable or empty value means the
 * chat has no overrides.
 */
export function parseStoredOverrides(
  text: string | null | undefined,
): ChatSettingsOverrides | undefined {
  if (!text) return undefined;
  try {
    const parsed = cleanOverrides(JSON.parse(text) as ChatSettingsOverrides);
    return Object.keys(parsed).length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

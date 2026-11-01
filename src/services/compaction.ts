import { invoke } from "@tauri-apps/api/core";
import type { CompactionSettings, CompactRequest, CompactResult } from "../types";
import {
  COMPACTION_ENABLED_KEY,
  COMPACTION_THRESHOLD_KEY,
  isValidThreshold,
  resolveCompactionSettings,
} from "../utils/compactionSettings";
import * as db from "./database";

/** Summarises the conversation with the loaded model. Resolves with the summary text. */
export function compactConversation(request: CompactRequest): Promise<CompactResult> {
  return invoke("compact_conversation", { request });
}

/** Stops a running summary. The chat keeps its history unchanged. */
export function cancelCompaction(jobId: string): Promise<void> {
  return invoke("cancel_compaction", { jobId });
}

/** The saved compaction settings. Each missing value falls back to its default. */
export async function getCompactionSettings(): Promise<CompactionSettings> {
  const [enabled, thresholdPercent] = await Promise.all([
    db.getPreference<boolean>(COMPACTION_ENABLED_KEY).catch(() => null),
    db.getPreference<number>(COMPACTION_THRESHOLD_KEY).catch(() => null),
  ]);
  return resolveCompactionSettings({ enabled, thresholdPercent });
}

/** Saves the compaction settings. Rejects a threshold outside 50 to 90. */
export async function saveCompactionSettings(settings: CompactionSettings): Promise<void> {
  if (!isValidThreshold(settings.thresholdPercent)) {
    throw new Error(
      `Compaction threshold must be a whole number from 50 to 90, got ${settings.thresholdPercent}`,
    );
  }
  await db.setPreference(COMPACTION_ENABLED_KEY, settings.enabled, "boolean");
  await db.setPreference(COMPACTION_THRESHOLD_KEY, settings.thresholdPercent, "number");
}

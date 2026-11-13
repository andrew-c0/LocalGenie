import type { ChatSettingsOverrides, CompactionSettings } from "../types";

/** Preference key: whether long conversations are summarised automatically. */
export const COMPACTION_ENABLED_KEY = "compaction_enabled";

/** Preference key: the share of the context window that triggers a summary, in percent. */
export const COMPACTION_THRESHOLD_KEY = "compaction_threshold_percent";

/** Off until the user turns it on. A summary cannot be undone. */
const COMPACTION_ENABLED_DEFAULT = false;

/** Used until the user saves a threshold. */
const COMPACTION_THRESHOLD_DEFAULT = 70;

export const COMPACTION_THRESHOLD_RANGE = { min: 50, max: 90 } as const;

export const COMPACTION_DEFAULTS: CompactionSettings = {
  enabled: COMPACTION_ENABLED_DEFAULT,
  thresholdPercent: COMPACTION_THRESHOLD_DEFAULT,
};

/** True for a whole percentage in the threshold range. Anything else (null, text, a fraction) is not valid. */
export function isValidThreshold(percent: unknown): percent is number {
  return (
    typeof percent === "number" &&
    Number.isInteger(percent) &&
    percent >= COMPACTION_THRESHOLD_RANGE.min &&
    percent <= COMPACTION_THRESHOLD_RANGE.max
  );
}

/**
 * The settings from the two stored values. Each value that is missing or of the wrong type falls
 * back to its default, so one bad value does not reset the other.
 */
export function resolveCompactionSettings(stored: {
  enabled: unknown;
  thresholdPercent: unknown;
}): CompactionSettings {
  return {
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : COMPACTION_ENABLED_DEFAULT,
    thresholdPercent: isValidThreshold(stored.thresholdPercent)
      ? stored.thresholdPercent
      : COMPACTION_THRESHOLD_DEFAULT,
  };
}

/** The compaction fields of a chat's overrides. */
export type CompactionOverrides = Pick<ChatSettingsOverrides, "compaction" | "compactionThreshold">;

/**
 * The setting a chat runs with: its own switch and threshold where it sets them, else the app setting.
 * An invalid chat threshold is ignored and the app threshold is used.
 */
export function effectiveCompaction(
  app: CompactionSettings,
  overrides: CompactionOverrides | undefined,
): CompactionSettings {
  const threshold = overrides?.compactionThreshold;
  return {
    enabled: overrides?.compaction ?? app.enabled,
    thresholdPercent: isValidThreshold(threshold) ? threshold : app.thresholdPercent,
  };
}

/** The three choices of a chat's compaction switch. */
export type CompactionChoice = "app" | "on" | "off";

/** The choice a chat's stored switch stands for. Absent means the app setting. */
export function compactionChoiceOf(compaction: boolean | undefined): CompactionChoice {
  if (compaction === undefined) return "app";
  return compaction ? "on" : "off";
}

/** The stored switch for a choice. The app setting is stored as absent. */
export function compactionOverrideOf(choice: CompactionChoice): boolean | undefined {
  if (choice === "app") return undefined;
  return choice === "on";
}

/** A short description of a compaction setting, for helper text: "on, at 70% of the window" or "off". */
export function describeCompaction(settings: CompactionSettings): string {
  return settings.enabled ? `on, at ${settings.thresholdPercent}% of the window` : "off";
}

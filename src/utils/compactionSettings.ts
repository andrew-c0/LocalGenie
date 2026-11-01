import type { CompactionSettings } from "../types";

/** Preference key: whether long conversations are summarised automatically. */
export const COMPACTION_ENABLED_KEY = "compaction_enabled";

/** Preference key: the share of the context window that triggers a summary, in percent. */
export const COMPACTION_THRESHOLD_KEY = "compaction_threshold_percent";

/** Off until the user turns it on. A summary cannot be undone. */
export const COMPACTION_ENABLED_DEFAULT = false;

/** Used until the user saves a threshold. */
export const COMPACTION_THRESHOLD_DEFAULT = 70;

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

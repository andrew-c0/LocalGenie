import type { CapabilityEntry, CapabilityKey } from "../types";

/** Shown on a control the server rejected. Also the reason the control is disabled. */
export const REJECTED_REASON = "The server rejected this setting.";

/**
 * True when the current result says the server rejected the setting. A stale result is not a
 * rejection: the control stays editable until the model is scanned again.
 */
export function isRejected(entry: CapabilityEntry | undefined): boolean {
  return entry !== undefined && !entry.stale && entry.status === "rejected";
}

/** Reason to disable a control for a rejected setting, or undefined when the control is editable. */
export function rejectedReason(entry: CapabilityEntry | undefined): string | undefined {
  return isRejected(entry) ? REJECTED_REASON : undefined;
}

/** Scan results indexed by setting, for looking up one control's result. */
export function capabilityMap(
  entries: CapabilityEntry[],
): Partial<Record<CapabilityKey, CapabilityEntry>> {
  return Object.fromEntries(entries.map((e) => [e.key, e]));
}

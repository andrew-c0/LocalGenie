import { errorMessage } from "./errorMessage";

/** One stored setting that a save changes. `previous` is the value to restore, null meaning unset. */
export interface SettingWrite {
  key: string;
  /** Name shown to the user when this write fails, for example "GPU port". */
  label: string;
  previous: number | null;
  next: number | null;
}

export type SettingWriter = (key: string, value: number | null) => Promise<void>;

export type SaveOutcome =
  | { ok: true }
  | {
      ok: false;
      /** Label of the setting whose write failed. */
      failed: string;
      reason: string;
      /** Labels of the settings written earlier in this save that could not be restored. */
      unrestored: string[];
    };

/**
 * Writes the settings in order. When one write fails, the settings this call already wrote are put
 * back to their previous values, last written first (best effort), so the stored settings are not
 * left half-applied. The failing setting itself is not rolled back.
 */
export async function writeAllOrRollBack(
  writes: SettingWrite[],
  write: SettingWriter,
): Promise<SaveOutcome> {
  const written: SettingWrite[] = [];
  for (const setting of writes) {
    try {
      await write(setting.key, setting.next);
      written.push(setting);
    } catch (err) {
      const unrestored = await restorePrevious(written, write);
      return { ok: false, failed: setting.label, reason: errorMessage(err), unrestored };
    }
  }
  return { ok: true };
}

/** Writes each setting's previous value, newest first. Returns the labels that could not be restored. */
async function restorePrevious(written: SettingWrite[], write: SettingWriter): Promise<string[]> {
  const unrestored: string[] = [];
  for (const setting of [...written].reverse()) {
    try {
      await write(setting.key, setting.previous);
    } catch (err) {
      console.error(`Failed to restore ${setting.label}:`, err);
      unrestored.push(setting.label);
    }
  }
  return unrestored;
}

/** Body text for the toast that reports a failed save. */
export function describeSaveFailure(outcome: Extract<SaveOutcome, { ok: false }>): string {
  const kept =
    outcome.unrestored.length === 0
      ? "The earlier values were kept."
      : `Could not restore: ${outcome.unrestored.join(", ")}.`;
  return `${outcome.reason} ${kept}`;
}

import { SD_CPP_NAME, SD_CPP_RUNTIME_ID } from "./playground";
import { SHERPA_NAME, type SHERPA_RUNTIME_ID } from "./speech";

/** What the app has installed. A null field means it has not been read yet. */
export interface InstalledRuntimes {
  cliInstalled: boolean | null;
  runtimeIds: string[] | null;
}

/** The runtime an area needs. `cli` is the GenieX CLI; the others are optional runtimes by registry id. */
export type RuntimeNeed = "cli" | typeof SD_CPP_RUNTIME_ID | typeof SHERPA_RUNTIME_ID;

const GENIEX_NAME = "the GenieX CLI";

/** What a need is called in messages. */
function needName(need: RuntimeNeed): string {
  if (need === "cli") return GENIEX_NAME;
  return need === SD_CPP_RUNTIME_ID ? SD_CPP_NAME : SHERPA_NAME;
}

/** Whether a need is met. An unread state counts as met, so nothing is locked before the first read. */
function isMet(need: RuntimeNeed, installed: InstalledRuntimes): boolean {
  if (need === "cli") return installed.cliInstalled !== false;
  return installed.runtimeIds === null || installed.runtimeIds.includes(need);
}

/** The tooltip for an area that is locked because its runtime is missing, or null when it is open. */
export function lockedReason(need: RuntimeNeed, installed: InstalledRuntimes): string | null {
  if (isMet(need, installed)) return null;
  return `Needs ${needName(need)}. Install it in Settings > Runtimes.`;
}

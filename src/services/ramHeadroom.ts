import { isValidHeadroom, RAM_HEADROOM_DEFAULT, RAM_HEADROOM_KEY } from "../utils/ramHeadroom";
import * as db from "./database";

/** Share of total RAM to keep free. The default when nothing valid is stored. */
export async function getRamHeadroomPercent(): Promise<number> {
  const stored = await db.getPreference<number>(RAM_HEADROOM_KEY).catch(() => null);
  return isValidHeadroom(stored) ? stored : RAM_HEADROOM_DEFAULT;
}

/** Saves the share of total RAM to keep free. Rejects a value outside 0 to 50. */
export async function saveRamHeadroomPercent(percent: number): Promise<void> {
  if (!isValidHeadroom(percent)) {
    throw new Error(`RAM headroom must be a whole number from 0 to 50, got ${percent}`);
  }
  await db.setPreference(RAM_HEADROOM_KEY, percent, "number");
}

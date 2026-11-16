import { type TurnEnd, turnNotice } from "../../utils/dispatchTask";
import { notifyIfHidden } from "../trayStatus";

/**
 * Tells the user a turn ended, as a desktop notice when the window is hidden. A stop is the user's own doing
 * and gets none (`turnNotice` decides that).
 */
export function announceTurnEnd(end: TurnEnd): void {
  const notice = turnNotice(end);
  if (notice) void notifyIfHidden(notice.title, notice.body);
}

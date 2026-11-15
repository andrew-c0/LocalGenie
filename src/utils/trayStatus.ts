import type { DownloadStatus } from "../stores/downloadStore";

/** Something the app is doing in the background, shown in the tray tooltip. */
export interface TrayActivity {
  id: string;
  /** A ready verb phrase, such as "Downloading Qwen3 4B". */
  label: string;
  /** Whole percent done, when it is known. */
  percent?: number;
}

/** The tooltip stays under the backend's 120-character limit. */
export const TRAY_TOOLTIP_MAX_LENGTH = 119;

const ELLIPSIS = "…";

/** The label cut to `room` characters, with an ellipsis when it had to be cut. */
function fitLabel(label: string, room: number): string {
  if (label.length <= room) return label;
  return `${label.slice(0, Math.max(0, room - ELLIPSIS.length)).trimEnd()}${ELLIPSIS}`;
}

/**
 * The tray tooltip for the activities: null for none. One activity reads "<label> <percent>%"; several
 * name the first and count the rest, as "<label> <percent>% (+N more)". The label is cut, not the count.
 */
export function trayTooltip(activities: TrayActivity[]): string | null {
  const [first] = activities;
  if (!first) return null;
  const moreCount = activities.length - 1;
  const percentPart =
    first.percent === undefined ? "" : ` ${Math.round(Math.min(100, Math.max(0, first.percent)))}%`;
  const morePart = moreCount > 0 ? ` (+${moreCount} more)` : "";
  const tail = `${percentPart}${morePart}`;
  return `${fitLabel(first.label, TRAY_TOOLTIP_MAX_LENGTH - tail.length)}${tail}`;
}

/**
 * The downloads that moved to `finished` between two snapshots, matched by id. An entry that was already
 * finished in `previous` is not returned again, so each finish is reported once.
 */
export function downloadsFinished<T extends { id: string; status: DownloadStatus }>(
  previous: readonly T[],
  next: readonly T[],
): T[] {
  const previousStatusById = new Map(previous.map((download) => [download.id, download.status]));
  return next.filter(
    (download) =>
      download.status === "finished" && previousStatusById.get(download.id) !== "finished",
  );
}

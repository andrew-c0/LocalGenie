import { useDispatchStore } from "../../../stores/dispatchStore";
import { useDownloadStore } from "../../../stores/downloadStore";
import { dispatchActivityOf } from "../../../utils/dispatchTask";
import { downloadActivityOf } from "../../../utils/downloadActivity";
import type { TrayActivity } from "../../../utils/trayStatus";

/**
 * Background work that the tray tooltip shows. `read` gives its activities now; `subscribe` calls back
 * whenever they may have changed, so the tooltip follows without polling.
 */
export interface TrayActivitySource {
  read: () => TrayActivity[];
  subscribe: (onChange: () => void) => () => void;
}

const downloadSource: TrayActivitySource = {
  read: () =>
    useDownloadStore
      .getState()
      .downloads.map(downloadActivityOf)
      .filter((activity): activity is TrayActivity => activity !== null),
  subscribe: (onChange) => useDownloadStore.subscribe(onChange),
};

const dispatchSource: TrayActivitySource = {
  read: () =>
    useDispatchStore
      .getState()
      .tasks.map(dispatchActivityOf)
      .filter((activity): activity is TrayActivity => activity !== null),
  subscribe: (onChange) => useDispatchStore.subscribe(onChange),
};

/**
 * Every source the tooltip merges: downloads, then Dispatch tasks. The tooltip and the runtime need no
 * other change when a source is added.
 */
export const TRAY_ACTIVITY_SOURCES: readonly TrayActivitySource[] = [
  downloadSource,
  dispatchSource,
];

/** The activities of every source, in source order. */
export function collectTrayActivities(): TrayActivity[] {
  return TRAY_ACTIVITY_SOURCES.flatMap((source) => source.read());
}

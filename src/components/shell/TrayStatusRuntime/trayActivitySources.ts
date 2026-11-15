import { useDownloadStore } from "../../../stores/downloadStore";
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

/**
 * Every source the tooltip merges. Dispatch adds its own source here later (its `read` and the store it
 * reads from as `subscribe`); the tooltip and the runtime need no other change.
 */
export const TRAY_ACTIVITY_SOURCES: readonly TrayActivitySource[] = [downloadSource];

/** The activities of every source, in source order. */
export function collectTrayActivities(): TrayActivity[] {
  return TRAY_ACTIVITY_SOURCES.flatMap((source) => source.read());
}

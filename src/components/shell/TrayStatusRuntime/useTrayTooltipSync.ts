import { useEffect } from "react";
import { setTrayTooltip } from "../../../services/trayStatus";
import { createTrailingThrottle } from "../../../utils/trailingThrottle";
import { trayTooltip } from "../../../utils/trayStatus";
import { collectTrayActivities, TRAY_ACTIVITY_SOURCES } from "./trayActivitySources";

/** The tooltip changes at most this often. A change inside the window lands at its end. */
const TOOLTIP_INTERVAL_MS = 2000;

/** Keeps the tray tooltip in step with the background activities. Calls the service only when the text changes. */
export function useTrayTooltipSync(): void {
  useEffect(() => {
    const throttle = createTrailingThrottle<string | null>(
      null,
      (text) => {
        void setTrayTooltip(text);
      },
      TOOLTIP_INTERVAL_MS,
    );
    const refresh = () => throttle.push(trayTooltip(collectTrayActivities()));
    refresh();
    const unsubscribes = TRAY_ACTIVITY_SOURCES.map((source) => source.subscribe(refresh));
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
      throttle.cancel();
    };
  }, []);
}

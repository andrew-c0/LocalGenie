import { useEffect, useState } from "react";

const TICK_MS = 1000;

/**
 * The current time in milliseconds, refreshed every second while `live` is true. When it is false the
 * value stays where it was, so a finished item shows its time from when it stopped ticking.
 */
export function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [live]);

  return now;
}

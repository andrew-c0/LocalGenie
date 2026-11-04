import { useEffect, useRef, useState } from "react";
import { isBackOnline, isBrowserOffline } from "../utils/networkError";

/** Whether the browser has a network connection, kept up to date by its online and offline events. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => !isBrowserOffline());

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}

/**
 * Calls `retry` once each time the browser goes from offline to online, while `active` is true.
 * Put it where an error is shown: the area that failed then retries on its own when the
 * connection returns. `retry` may change every render; the latest one is called.
 */
export function useRetryWhenOnline(active: boolean, retry: () => void): void {
  const online = useOnlineStatus();
  const wasOnline = useRef(online);
  const retryRef = useRef(retry);

  useEffect(() => {
    retryRef.current = retry;
  });

  useEffect(() => {
    const cameBack = isBackOnline(wasOnline.current, online);
    wasOnline.current = online;
    if (active && cameBack) retryRef.current();
  }, [active, online]);
}

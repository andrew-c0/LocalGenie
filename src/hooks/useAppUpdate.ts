import { useEffect, useRef } from "react";
import { notify } from "../services/notifications";
import { useAppUpdateStore } from "../stores/appUpdateStore";
import { useRuntimeNoticeStore } from "../stores/runtimeNoticeStore";
import {
  APP_UPDATE_START_DELAY_MS,
  APP_UPDATE_TICK_MS,
  appUpdateNoticeText,
  shouldCheckNow,
  shouldNotify,
} from "../utils/appUpdate";
import { useRetryWhenOnline } from "./useOnlineStatus";

/** A stable callback for the retry: it reads the store when called, so it never changes. */
const retryCheck = () => {
  void useAppUpdateStore.getState().checkNow();
};

/**
 * App update side effects: a check shortly after start and then every six hours while the app runs, a
 * retry of a failed check when the connection returns, and one desktop notice per new version. The
 * notice uses the runtime update notification switch. Background checks are silent: no toast.
 */
export function useAppUpdate(): void {
  const status = useAppUpdateStore((s) => s.status);
  const errorAction = useAppUpdateStore((s) => s.errorAction);
  const update = useAppUpdateStore((s) => s.update);
  const notifiedVersion = useAppUpdateStore((s) => s.notifiedVersion);
  const notifiedLoaded = useAppUpdateStore((s) => s.notifiedLoaded);
  const recordNotified = useAppUpdateStore((s) => s.recordNotified);
  const notifyEnabled = useRuntimeNoticeStore((s) => s.notifyEnabled);
  const sendingRef = useRef(false);

  useEffect(() => {
    const checkIfDue = () => {
      if (shouldCheckNow(useAppUpdateStore.getState().lastCheckedAt, Date.now())) retryCheck();
    };
    const startTimer = setTimeout(checkIfDue, APP_UPDATE_START_DELAY_MS);
    const timer = setInterval(checkIfDue, APP_UPDATE_TICK_MS);
    return () => {
      clearTimeout(startTimer);
      clearInterval(timer);
    };
  }, []);

  useRetryWhenOnline(status === "error" && errorAction === "check", retryCheck);

  useEffect(() => {
    if (status !== "available" || !update || !notifyEnabled || !notifiedLoaded) return;
    if (sendingRef.current || !shouldNotify(update.version, notifiedVersion)) return;

    const { title, body } = appUpdateNoticeText(update.version, update.currentVersion);
    sendingRef.current = true;
    void notify(title, body)
      .then((sent) => {
        if (sent) recordNotified(update.version);
      })
      .finally(() => {
        sendingRef.current = false;
      });
  }, [status, update, notifyEnabled, notifiedVersion, notifiedLoaded, recordNotified]);
}

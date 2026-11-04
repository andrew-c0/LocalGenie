import { useEffect, useRef } from "react";
import { notify } from "../../../services/notifications";
import { useRuntimeNoticeStore } from "../../../stores/runtimeNoticeStore";
import { type UpdateCheck, useRuntimeStore } from "../../../stores/runtimeStore";
import { noticeText, updatesToNotify } from "../../../utils/runtimeUpdateNotice";

/** True while any runtime's update check is running. */
function isAnyCheckRunning(checks: Record<string, UpdateCheck>): boolean {
  return Object.values(checks).some((check) => check.status === "checking");
}

/**
 * Sends one notification for the runtime updates not notified yet, once every check has settled, so a
 * batch of checks gives one notification. The versions are recorded only after the notification was
 * sent. Runs again when the list, the updates, the switch or the notified versions change.
 */
export function useRuntimeUpdateNotices(): void {
  const runtimes = useRuntimeStore((s) => s.runtimes);
  const updatesById = useRuntimeStore((s) => s.updatesById);
  const isChecking = useRuntimeStore((s) => isAnyCheckRunning(s.updateChecks));
  const notifyEnabled = useRuntimeNoticeStore((s) => s.notifyEnabled);
  const notifiedVersions = useRuntimeNoticeStore((s) => s.notifiedVersions);
  const recordNotified = useRuntimeNoticeStore((s) => s.recordNotified);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (!notifyEnabled || runtimes === null || notifiedVersions === null) return;
    if (isChecking || sendingRef.current) return;

    const pending = updatesToNotify(runtimes, updatesById, notifiedVersions);
    if (pending.length === 0) return;

    const { title, body } = noticeText(pending);
    sendingRef.current = true;
    void notify(title, body)
      .then((sent) => {
        if (sent) recordNotified(pending);
      })
      .finally(() => {
        sendingRef.current = false;
      });
  }, [notifyEnabled, runtimes, updatesById, notifiedVersions, isChecking, recordNotified]);
}

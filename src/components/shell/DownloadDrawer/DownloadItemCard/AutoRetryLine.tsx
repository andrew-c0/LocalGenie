import { Caption1 } from "@fluentui/react-components";
import type { AutoRetryNotice } from "../../../../utils/downloadAutoRetry";
import { autoRetryStatusText } from "../../../../utils/downloadAutoRetryText";
import { RetryCountdown } from "./RetryCountdown";

interface AutoRetryLineProps {
  /** The entry's retry state, or null when there is nothing to show. */
  notice: AutoRetryNotice | null;
  /** The raw error, kept on hover for a bug report. */
  title?: string;
  className?: string;
}

/** The status line of an entry that retries by itself: waiting, counting down, running, or used up. */
export function AutoRetryLine({ notice, title, className }: AutoRetryLineProps) {
  if (!notice) return null;
  if (notice.kind === "scheduled") {
    return (
      <RetryCountdown
        retryAt={notice.retryAt}
        attempt={notice.attempt}
        title={title}
        className={className}
      />
    );
  }
  return (
    <Caption1 className={className} title={title}>
      {autoRetryStatusText(notice)}
    </Caption1>
  );
}

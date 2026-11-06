import { Caption1 } from "@fluentui/react-components";
import { secondsUntil } from "../../../../utils/downloadAutoRetry";
import { retryInText } from "../../../../utils/downloadAutoRetryText";
import { useNow } from "../../../playground/useNow";

const TICK_MS = 1000;

interface RetryCountdownProps {
  /** When the automatic retry starts (epoch ms). */
  retryAt: number;
  /** The retry this countdown leads to, counted from 1. */
  attempt: number;
  title?: string;
  className?: string;
}

/**
 * "Retrying in N s", redrawn once a second. Only this line re-renders on a tick, not the card or the drawer.
 */
export function RetryCountdown({ retryAt, attempt, title, className }: RetryCountdownProps) {
  const now = useNow(TICK_MS);
  return (
    <Caption1 className={className} title={title}>
      {retryInText(secondsUntil(retryAt, now), attempt)}
    </Caption1>
  );
}

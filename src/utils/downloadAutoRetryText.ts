import { type AutoRetryNotice, MAX_AUTO_RETRIES } from "./downloadAutoRetry";

/** Shown while the browser is offline and a failed download will resume when it comes back. */
export const WAITING_FOR_CONNECTION_TEXT = "Waiting for the connection to come back";

/** Shown under a failure whose automatic retries are all used. */
export const RETRIES_USED_UP_TEXT = "Automatic retries used up";

/** The status of a retry that is not counting down: waiting for the connection, running, or used up. */
export function autoRetryStatusText(
  notice: Exclude<AutoRetryNotice, { kind: "scheduled" }>,
): string {
  switch (notice.kind) {
    case "offline":
      return WAITING_FOR_CONNECTION_TEXT;
    case "running":
      return `Retrying (attempt ${notice.attempt} of ${MAX_AUTO_RETRIES})`;
    case "exhausted":
      return RETRIES_USED_UP_TEXT;
  }
}

/** The countdown line: "Retrying in 15 s (attempt 2 of 3)", or "Retrying now" once the time has come. */
export function retryInText(secondsLeft: number, attempt: number): string {
  const position = `(attempt ${attempt} of ${MAX_AUTO_RETRIES})`;
  return secondsLeft > 0 ? `Retrying in ${secondsLeft} s ${position}` : `Retrying now ${position}`;
}

/** The info toast title when a reconnect starts the retries of `count` downloads. */
export function reconnectToastTitle(count: number): string {
  return `Connection is back: resuming ${count} ${count === 1 ? "download" : "downloads"}`;
}

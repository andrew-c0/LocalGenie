import { errorMessage } from "./errorMessage";

/**
 * What went wrong with a cloud request, as far as the screen needs to know: the browser has no
 * connection, the service is limiting requests, the answer took too long, or anything else.
 */
export type NetworkErrorKind = "offline" | "rate-limited" | "timeout" | "other";

/** The services the app reads from, named in the wording of a failure. */
export const SERVICE_NAMES = {
  huggingFace: "Hugging Face",
  aihub: "Qualcomm AI Hub",
  github: "GitHub",
} as const;

/** Fragments (lower case) of a message that means the request never reached the service. */
const OFFLINE_MARKERS = [
  "failed to fetch",
  "networkerror",
  "load failed",
  "error sending request",
  "dns error",
  "failed to lookup",
  "connection refused",
  "connection reset",
  "connection closed",
  "tcp connect error",
  "could not reach",
  "failed to reach",
  "hf api request failed",
  "network is unreachable",
];

const RATE_LIMIT_MARKERS = ["rate limit", "too many requests"];
/** An HTTP 429 status, written as a whole number in fetch and Rust messages. */
const RATE_LIMIT_STATUS = /\b429\b/;

const TIMEOUT_MARKERS = ["timed out", "timeout", "aborted"];

const OFFLINE_TEXT = "You appear to be offline. Check your connection and try again.";

/** True when the browser reports no network connection. */
export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** True on the step where the browser goes from offline to online. */
export function isBackOnline(wasOnline: boolean, isOnline: boolean): boolean {
  return !wasOnline && isOnline;
}

function includesAny(text: string, markers: readonly string[]): boolean {
  return markers.some((marker) => text.includes(marker));
}

/** Lower-case text of an error: the name and message of an Error, or the text of a string. */
function textOf(err: unknown): string {
  if (err instanceof Error) return `${err.name} ${err.message}`.toLowerCase();
  return errorMessage(err, "").toLowerCase();
}

/**
 * Sort a failed request into one of four kinds. Offline wins whenever the browser has no
 * connection, so a failure seen while offline is always reported as offline.
 */
export function classifyNetworkError(err: unknown): NetworkErrorKind {
  const text = textOf(err);
  if (isBrowserOffline() || includesAny(text, OFFLINE_MARKERS)) return "offline";
  if (RATE_LIMIT_STATUS.test(text) || includesAny(text, RATE_LIMIT_MARKERS)) return "rate-limited";
  if (includesAny(text, TIMEOUT_MARKERS)) return "timeout";
  return "other";
}

/**
 * The text to show for a failed request. `subject` names the service in the wording, for example
 * "Hugging Face". Other errors keep their own message.
 */
export function networkErrorMessage(err: unknown, subject: string): string {
  switch (classifyNetworkError(err)) {
    case "offline":
      return OFFLINE_TEXT;
    case "rate-limited":
      return `${subject} is limiting requests right now. Wait a moment and try again.`;
    case "timeout":
      return `${subject} took too long to answer. Try again.`;
    case "other":
      return errorMessage(err);
  }
}

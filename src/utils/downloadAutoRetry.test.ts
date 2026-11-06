import { afterEach, describe, expect, it, vi } from "vitest";
import type { DownloadItem } from "../stores/downloadStore";
import {
  autoRetryNoticeOf,
  failureRetryDelayMs,
  hasAutoRetryBudget,
  isAutomaticRetry,
  isAutoRetryEligible,
  MAX_AUTO_RETRIES,
  nextAutoRetries,
  reconnectDelayMs,
  reconnectRetryItems,
  retryDelayMs,
  secondsUntil,
  willRetryAutomatically,
} from "./downloadAutoRetry";

const OFFLINE_ERROR = "Download request failed: error sending request for url";
const TIMEOUT_ERROR = "Download request failed: operation timed out";

/** A failed Hugging Face download, with the raw error the pipeline records. */
const failed = (overrides: Partial<DownloadItem> = {}): DownloadItem => ({
  id: "owner/model",
  label: "owner/model",
  received: 0,
  total: null,
  speed: 0,
  status: "error",
  error: OFFLINE_ERROR,
  startedAt: 0,
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isAutoRetryEligible", () => {
  it.each([
    ["an offline request", OFFLINE_ERROR],
    ["a failed fetch", "TypeError: Failed to fetch"],
    ["a timeout", TIMEOUT_ERROR],
    ["a dropped connection", "connection reset by peer"],
  ])("retries %s", (_, error) => {
    expect(isAutoRetryEligible(failed({ error }))).toBe(true);
  });

  it.each([
    ["a bad file", "Failed to create file: disk full"],
    ["an HTTP 404", "Download failed with status 404 Not Found"],
    ["an HTTP 403", "Download failed with status 403 Forbidden"],
    ["a checksum mismatch", "SHA-256 mismatch: expected abc, got def"],
    ["a rate limit by status", "Download failed with status 429 Too Many Requests"],
    ["a rate limit by message", "rate limit exceeded, try later"],
  ])("does not retry %s", (_, error) => {
    expect(isAutoRetryEligible(failed({ error }))).toBe(false);
  });

  it("does not retry a cancelled, finished or running entry, even with a network error text", () => {
    expect(isAutoRetryEligible(failed({ status: "cancelled" }))).toBe(false);
    expect(isAutoRetryEligible(failed({ status: "finished" }))).toBe(false);
    expect(isAutoRetryEligible(failed({ status: "downloading" }))).toBe(false);
  });

  it("does not retry a failure with no error text", () => {
    expect(isAutoRetryEligible(failed({ error: undefined }))).toBe(false);
  });

  it("keeps a bad-file failure ineligible when it was recorded while the browser was offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isAutoRetryEligible(failed({ error: "Failed to create file: disk full" }))).toBe(false);
  });
});

describe("retry budget", () => {
  it("allows up to MAX_AUTO_RETRIES automatic retries in one failure episode", () => {
    expect(MAX_AUTO_RETRIES).toBe(3);
    expect(hasAutoRetryBudget({ autoRetries: undefined })).toBe(true);
    expect(hasAutoRetryBudget({ autoRetries: 2 })).toBe(true);
    expect(hasAutoRetryBudget({ autoRetries: 3 })).toBe(false);
  });

  it("starts a manual run with a fresh count, whatever the count was", () => {
    expect(nextAutoRetries({ autoRetries: 2 }, "manual")).toBe(0);
    expect(nextAutoRetries(undefined, "manual")).toBe(0);
  });

  it("counts an automatic run one more than the entry had", () => {
    expect(nextAutoRetries(undefined, "automatic")).toBe(1);
    expect(nextAutoRetries({ autoRetries: undefined }, "automatic")).toBe(1);
    expect(nextAutoRetries({ autoRetries: 2 }, "automatic")).toBe(3);
  });

  it("tells an automatic retry from the first attempt", () => {
    expect(isAutomaticRetry(undefined)).toBe(false);
    expect(isAutomaticRetry(failed({ autoRetries: 0 }))).toBe(false);
    expect(isAutomaticRetry(failed({ autoRetries: 1 }))).toBe(true);
  });
});

describe("backoff", () => {
  it("waits 5 s, 15 s, then 45 s", () => {
    expect([0, 1, 2].map(retryDelayMs)).toEqual([5_000, 15_000, 45_000]);
  });

  it("keeps the last delay past the budget, and treats a negative attempt as the first", () => {
    expect(retryDelayMs(3)).toBe(45_000);
    expect(retryDelayMs(-1)).toBe(5_000);
  });

  it("gives the delay of the next retry while the budget lasts, then none", () => {
    expect(failureRetryDelayMs(failed({ autoRetries: undefined }))).toBe(5_000);
    expect(failureRetryDelayMs(failed({ autoRetries: 1 }))).toBe(15_000);
    expect(failureRetryDelayMs(failed({ autoRetries: 2 }))).toBe(45_000);
    expect(failureRetryDelayMs(failed({ autoRetries: 3 }))).toBeNull();
  });

  it("gives no delay to a failure that is not a network one", () => {
    expect(failureRetryDelayMs(failed({ error: "Download failed with status 404" }))).toBeNull();
  });

  it("walks the whole sequence of a failing download: three automatic retries, then it stops", () => {
    const delays: (number | null)[] = [];
    let item = failed();
    for (let step = 0; step < 5; step++) {
      const delay = failureRetryDelayMs(item);
      delays.push(delay);
      if (delay === null) break;
      item = { ...item, autoRetries: nextAutoRetries(item, "automatic") };
    }
    expect(delays).toEqual([5_000, 15_000, 45_000, null]);
  });
});

describe("reconnect", () => {
  it("retries every eligible entry, exhausted ones too, and leaves out the rest", () => {
    const downloads = [
      failed({ id: "a", autoRetries: 0 }),
      failed({ id: "b", autoRetries: 3 }),
      failed({ id: "c", error: "disk full" }),
      failed({ id: "d", status: "cancelled" }),
    ];
    expect(reconnectRetryItems(downloads).map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("starts the first retry at once and spaces the others one second apart", () => {
    expect([0, 1, 2].map(reconnectDelayMs)).toEqual([0, 1_000, 2_000]);
  });

  it("gives an exhausted entry one fresh budget per reconnect, not an endless one", () => {
    const exhausted = failed({ autoRetries: 3 });
    expect(hasAutoRetryBudget(exhausted)).toBe(false);
    // The hook resets the count for an exhausted entry on reconnect, then the retry runs as an automatic one.
    const afterReconnect = { ...exhausted, autoRetries: 0 };
    expect(failureRetryDelayMs(afterReconnect)).toBe(5_000);
    expect(nextAutoRetries(afterReconnect, "automatic")).toBe(1);
    // A failure timer does not refill the budget: the same exhausted entry gets no delay.
    expect(failureRetryDelayMs(exhausted)).toBeNull();
  });
});

describe("willRetryAutomatically", () => {
  it("is true for an eligible failure with budget left, and false otherwise", () => {
    expect(willRetryAutomatically(failed({ autoRetries: 1 }))).toBe(true);
    expect(willRetryAutomatically(failed({ autoRetries: 3 }))).toBe(false);
    expect(willRetryAutomatically(failed({ error: "disk full" }))).toBe(false);
    expect(willRetryAutomatically(undefined)).toBe(false);
  });
});

describe("autoRetryNoticeOf", () => {
  it("says it waits for the connection while offline", () => {
    expect(autoRetryNoticeOf(failed(), false)).toEqual({ kind: "offline" });
  });

  it("still says it waits while offline with its budget used up, since a reconnect gives a fresh one", () => {
    expect(autoRetryNoticeOf(failed({ autoRetries: 3 }), false)).toEqual({ kind: "offline" });
  });

  it("counts down the scheduled retry, numbering the attempt after the ones used", () => {
    expect(autoRetryNoticeOf(failed({ autoRetries: 1, autoRetryAt: 15_000 }), true)).toEqual({
      kind: "scheduled",
      retryAt: 15_000,
      attempt: 2,
    });
  });

  it("shows nothing for an online failure that has budget left but no retry scheduled yet", () => {
    expect(autoRetryNoticeOf(failed({ autoRetries: 0 }), true)).toBeNull();
  });

  it("says the retries are used up once the budget is gone while online", () => {
    expect(autoRetryNoticeOf(failed({ autoRetries: 3 }), true)).toEqual({ kind: "exhausted" });
  });

  it("shows nothing for a failure that is not a network one", () => {
    expect(autoRetryNoticeOf(failed({ error: "disk full", autoRetries: 3 }), true)).toBeNull();
    expect(autoRetryNoticeOf(failed({ error: "disk full" }), false)).toBeNull();
  });

  it("shows the attempt in progress while a retry runs, and nothing for a first attempt", () => {
    expect(autoRetryNoticeOf(failed({ status: "downloading", autoRetries: 2 }), true)).toEqual({
      kind: "running",
      attempt: 2,
    });
    expect(autoRetryNoticeOf(failed({ status: "queued", autoRetries: 0 }), true)).toBeNull();
  });

  it("shows nothing for finished or cancelled entries", () => {
    expect(autoRetryNoticeOf(failed({ status: "finished", autoRetries: 2 }), true)).toBeNull();
    expect(autoRetryNoticeOf(failed({ status: "cancelled", autoRetries: 2 }), true)).toBeNull();
  });
});

describe("secondsUntil", () => {
  it("rounds up to whole seconds and never goes below zero", () => {
    expect(secondsUntil(15_000, 0)).toBe(15);
    expect(secondsUntil(14_001, 0)).toBe(15);
    expect(secondsUntil(1_000, 5_000)).toBe(0);
  });
});

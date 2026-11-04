import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyNetworkError, isBackOnline, networkErrorMessage } from "./networkError";

/** Pin the browser's connection state for a test; Node has no real navigator.onLine. */
function setOnline(online: boolean) {
  vi.stubGlobal("navigator", { onLine: online });
}

beforeEach(() => setOnline(true));
afterEach(() => vi.unstubAllGlobals());

describe("classifyNetworkError", () => {
  it("reports offline when the browser has no connection, whatever the message", () => {
    setOnline(false);
    expect(classifyNetworkError("Hugging Face API error 500: Internal Server Error")).toBe(
      "offline",
    );
  });

  it.each([
    "TypeError: Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "Load failed",
    "HF API request failed: error sending request for url",
    "dns error: failed to lookup address information",
    "No connection: connection refused",
    "connection reset by peer",
    "connection closed before message completed",
    "tcp connect error",
    "failed to reach huggingface.co",
    "network is unreachable",
    "Could not reach the Qualcomm AI Hub. Check your internet connection. Failed to reach the AI Hub: error sending request for url",
  ])("reports offline for a network failure: %s", (message) => {
    expect(classifyNetworkError(message)).toBe("offline");
  });

  it("reports offline for the AI Hub unreachable message whatever its cause", () => {
    expect(
      classifyNetworkError(
        "Could not reach the Qualcomm AI Hub. Check your internet connection. Failed to reach the AI Hub: operation timed out",
      ),
    ).toBe("offline");
  });

  it("matches the offline fragments case-insensitively and on Error objects", () => {
    expect(classifyNetworkError(new TypeError("FAILED TO FETCH"))).toBe("offline");
  });

  it.each([
    "HF API returned HTTP 429",
    "Hugging Face rate limit reached — try again in a moment.",
    "Too Many Requests",
  ])("reports rate-limited: %s", (message) => {
    expect(classifyNetworkError(message)).toBe("rate-limited");
  });

  it.each([
    "The operation was aborted due to timeout",
    "operation timed out",
    "request timeout after 30s",
    new DOMException("signal timed out", "TimeoutError"),
  ])("reports timeout: %s", (err) => {
    expect(classifyNetworkError(err)).toBe("timeout");
  });

  it("does not match a number that only contains 429", () => {
    expect(classifyNetworkError("Hugging Face API error 4290: unknown")).toBe("other");
  });

  it("reports other for a service error it does not recognise", () => {
    expect(classifyNetworkError("Hugging Face API error 500: Internal Server Error")).toBe("other");
  });

  it("treats a bare Error without a network marker as other", () => {
    expect(classifyNetworkError(new Error("Model not found"))).toBe("other");
  });
});

describe("networkErrorMessage", () => {
  it("gives the offline text", () => {
    setOnline(false);
    expect(networkErrorMessage("anything", "Hugging Face")).toBe(
      "You appear to be offline. Check your connection and try again.",
    );
  });

  it("names the subject when rate limited", () => {
    expect(networkErrorMessage("HF API returned HTTP 429", "Hugging Face")).toBe(
      "Hugging Face is limiting requests right now. Wait a moment and try again.",
    );
  });

  it("names the subject on a timeout", () => {
    expect(networkErrorMessage("request timed out", "AI Hub")).toBe(
      "AI Hub took too long to answer. Try again.",
    );
  });

  it("keeps the original message for other errors", () => {
    expect(networkErrorMessage("Hugging Face API error 500: Internal Server Error", "Hub")).toBe(
      "Hugging Face API error 500: Internal Server Error",
    );
  });

  it("falls back to the generic message for an empty error", () => {
    expect(networkErrorMessage("", "Hub")).toBe("Something went wrong.");
  });
});

describe("isBackOnline", () => {
  it("is true only on the offline-to-online step", () => {
    expect(isBackOnline(false, true)).toBe(true);
    expect(isBackOnline(true, true)).toBe(false);
    expect(isBackOnline(true, false)).toBe(false);
    expect(isBackOnline(false, false)).toBe(false);
  });
});

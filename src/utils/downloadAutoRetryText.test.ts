import { describe, expect, it } from "vitest";
import {
  autoRetryStatusText,
  RETRIES_USED_UP_TEXT,
  reconnectToastTitle,
  retryInText,
  WAITING_FOR_CONNECTION_TEXT,
} from "./downloadAutoRetryText";

describe("autoRetryStatusText", () => {
  it("names the wait, the running attempt and the used-up budget", () => {
    expect(autoRetryStatusText({ kind: "offline" })).toBe(WAITING_FOR_CONNECTION_TEXT);
    expect(autoRetryStatusText({ kind: "running", attempt: 2 })).toBe("Retrying (attempt 2 of 3)");
    expect(autoRetryStatusText({ kind: "exhausted" })).toBe(RETRIES_USED_UP_TEXT);
  });
});

describe("retryInText", () => {
  it("counts the seconds left and names the attempt", () => {
    expect(retryInText(15, 2)).toBe("Retrying in 15 s (attempt 2 of 3)");
  });

  it("says it is retrying now once the time has come", () => {
    expect(retryInText(0, 1)).toBe("Retrying now (attempt 1 of 3)");
  });
});

describe("reconnectToastTitle", () => {
  it("says how many downloads resume, in the singular and the plural", () => {
    expect(reconnectToastTitle(1)).toBe("Connection is back: resuming 1 download");
    expect(reconnectToastTitle(2)).toBe("Connection is back: resuming 2 downloads");
  });
});

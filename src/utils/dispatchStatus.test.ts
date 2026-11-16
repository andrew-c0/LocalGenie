import { describe, expect, it } from "vitest";
import type { DispatchStatus } from "../types";
import { conversationActionsOf, statusBadgeOf } from "./dispatchStatus";

describe("statusBadgeOf", () => {
  it("names the statuses the way the page reads them", () => {
    expect(statusBadgeOf("queued")).toEqual({ label: "Queued", tone: "default" });
    expect(statusBadgeOf("running")).toEqual({ label: "Working", tone: "blue" });
    expect(statusBadgeOf("done")).toEqual({ label: "Ready", tone: "green" });
    expect(statusBadgeOf("failed")).toEqual({ label: "Failed", tone: "red" });
    expect(statusBadgeOf("stopped")).toEqual({ label: "Stopped", tone: "default" });
    expect(statusBadgeOf("interrupted")).toEqual({ label: "Interrupted", tone: "cyan" });
  });

  it("names a conversation waiting for the user as Needs you, in purple", () => {
    expect(statusBadgeOf("needs_you")).toEqual({ label: "Needs you", tone: "purple" });
  });
});

describe("conversationActionsOf", () => {
  it("offers no header button while a turn works, waits or is queued (Stop is in the message field)", () => {
    expect(conversationActionsOf("running")).toEqual([]);
    expect(conversationActionsOf("needs_you")).toEqual([]);
    expect(conversationActionsOf("queued")).toEqual([]);
  });

  it("offers Continue and Delete to a stopped or interrupted conversation", () => {
    expect(conversationActionsOf("stopped")).toEqual(["continue", "delete"]);
    expect(conversationActionsOf("interrupted")).toEqual(["continue", "delete"]);
  });

  it("offers only Delete to a finished one", () => {
    expect(conversationActionsOf("done")).toEqual(["delete"]);
    expect(conversationActionsOf("failed")).toEqual(["delete"]);
  });

  it("gives every status a list", () => {
    const all: DispatchStatus[] = [
      "queued",
      "running",
      "needs_you",
      "done",
      "failed",
      "stopped",
      "interrupted",
    ];
    for (const status of all) expect(Array.isArray(conversationActionsOf(status))).toBe(true);
  });
});

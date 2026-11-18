import { describe, expect, it } from "vitest";
import type { ActiveStream } from "../types";
import { replyBelongsTo, streamBelongsTo, summaryBelongsTo } from "./streamOwner";

function stream(sessionId: string): ActiveStream {
  return { streamId: "stream-1", sessionId };
}

describe("streamBelongsTo", () => {
  it("is true only for the session the open stream belongs to", () => {
    expect(streamBelongsTo(stream("s1"), "s1")).toBe(true);
    expect(streamBelongsTo(stream("s2"), "s1")).toBe(false);
  });

  it("is false when no stream is open", () => {
    expect(streamBelongsTo(null, "s1")).toBe(false);
  });
});

describe("replyBelongsTo", () => {
  it("is true for the chat whose stream is open", () => {
    expect(replyBelongsTo(stream("chat"), null, "chat")).toBe(true);
  });

  it("is false for another chat or a Dispatch conversation whose stream is open", () => {
    expect(replyBelongsTo(stream("dispatch"), null, "chat")).toBe(false);
    expect(replyBelongsTo(stream("dispatch"), "chat", "chat")).toBe(false);
  });

  it("is true for the chat whose tool run is between two requests (no stream open)", () => {
    expect(replyBelongsTo(null, "chat", "chat")).toBe(true);
  });

  it("is false for another chat's tool run, and for a Dispatch turn between requests", () => {
    expect(replyBelongsTo(null, "other", "chat")).toBe(false);
    expect(replyBelongsTo(null, null, "chat")).toBe(false);
  });

  it("owns nothing when no chat is open", () => {
    expect(replyBelongsTo(stream("chat"), null, null)).toBe(false);
    expect(replyBelongsTo(null, "chat", null)).toBe(false);
  });
});

describe("summaryBelongsTo", () => {
  it("is true only for the session the summary was started for", () => {
    expect(summaryBelongsTo("s1", "s1")).toBe(true);
    expect(summaryBelongsTo("s2", "s1")).toBe(false);
  });

  it("is false when no summary runs", () => {
    expect(summaryBelongsTo(null, "s1")).toBe(false);
  });
});

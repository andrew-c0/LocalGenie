import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import { COMPACTING_LABEL, streamingStatusLabel } from "./streamingStatus";

function user(content: string): Message {
  return { id: "u", role: "user", content, timestamp: 0 };
}

function reply(content: string): Message {
  return { id: "a", role: "assistant", content, timestamp: 0 };
}

describe("streamingStatusLabel", () => {
  it("shows the summary line while a summary runs, whatever the stream does", () => {
    expect(streamingStatusLabel([user("hi")], true, true)).toBe(COMPACTING_LABEL);
    expect(streamingStatusLabel([user("hi")], false, true)).toBe(COMPACTING_LABEL);
  });

  it("shows nothing when no reply is streaming", () => {
    expect(streamingStatusLabel([user("hi")], false, false)).toBeNull();
  });

  it("shows prefill until the reply message exists", () => {
    expect(streamingStatusLabel([user("hi")], true, false)).toBe("Prefilling prompt…");
    expect(streamingStatusLabel([], true, false)).toBe("Prefilling prompt…");
  });

  it("shows outputting while the reply has no answer text yet", () => {
    expect(streamingStatusLabel([user("hi"), reply("")], true, false)).toBe("Outputting…");
  });

  it("shows nothing once the answer text is visible", () => {
    expect(streamingStatusLabel([user("hi"), reply("Hello")], true, false)).toBeNull();
  });

  it("shows nothing while a thinking block is open (its own panel shows progress)", () => {
    expect(
      streamingStatusLabel([user("hi"), reply("<think>still thinking")], true, false),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import { type CompactNowState, compactNowBlocker } from "./compactNow";

const conversation: Message[] = [
  { id: "u1", role: "user", content: "question", timestamp: 1 },
  { id: "a1", role: "assistant", content: "answer", timestamp: 2 },
];

const ready: CompactNowState = {
  modelId: "model-a",
  serverRunning: true,
  streaming: false,
  compacting: false,
  messages: conversation,
};

describe("compactNowBlocker", () => {
  it("allows Compact now when a model runs, the server is up and there is something to summarise", () => {
    expect(compactNowBlocker(ready)).toBeNull();
  });

  it("refuses while a summary runs, and while a reply streams", () => {
    expect(compactNowBlocker({ ...ready, compacting: true })).toMatch(/already running/);
    expect(compactNowBlocker({ ...ready, streaming: true })).toMatch(/Wait for the reply/);
  });

  it("refuses when no model is selected for the chat", () => {
    expect(compactNowBlocker({ ...ready, modelId: null })).toMatch(/Select a model/);
  });

  it("refuses when the server is not running", () => {
    expect(compactNowBlocker({ ...ready, serverRunning: false })).toMatch(
      /Start the GenieX server/,
    );
  });

  it("refuses when there is nothing since the newest summary", () => {
    const summarised: Message[] = [
      ...conversation,
      {
        id: "s",
        role: "system",
        kind: "system",
        systemType: "summary",
        content: "Facts.",
        timestamp: 3,
        coversThroughId: "a1",
      },
    ];
    expect(compactNowBlocker({ ...ready, messages: summarised })).toMatch(/Nothing to summarise/);
  });

  it("refuses an empty conversation", () => {
    expect(compactNowBlocker({ ...ready, messages: [] })).toMatch(/Nothing to summarise/);
  });

  it("shows the first reason that applies", () => {
    expect(compactNowBlocker({ ...ready, modelId: null, serverRunning: false })).toMatch(
      /Select a model/,
    );
  });
});

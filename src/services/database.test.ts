import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { loadSessions, saveMessage } from "./database";

const session = {
  id: "s1",
  title: "t",
  model_id: null,
  context_chars: 0,
  created_at: 1,
  updated_at: 9,
};

describe("loadSessions", () => {
  beforeEach(() => invokeMock.mockReset());

  it("restores finish_reason on messages", async () => {
    invokeMock.mockResolvedValue([
      {
        ...session,
        messages: [
          {
            id: "m1",
            session_id: "s1",
            role: "assistant",
            content: "hi",
            model_id: null,
            created_at: 2,
            finish_reason: "length",
          },
          {
            id: "m2",
            session_id: "s1",
            role: "user",
            content: "q",
            model_id: null,
            created_at: 1,
            finish_reason: null,
          },
        ],
        errors: [],
      },
    ]);
    const [s] = await loadSessions();
    expect(s.messages.map((m) => m.finishReason)).toEqual([undefined, "length"]);
  });

  it("leaves stats undefined when the message has no stats columns set", async () => {
    invokeMock.mockResolvedValue([
      {
        ...session,
        messages: [
          {
            id: "m1",
            session_id: "s1",
            role: "assistant",
            content: "old reply",
            model_id: null,
            created_at: 2,
            finish_reason: null,
            time_to_first_token_ms: null,
            total_time_ms: null,
            token_count: null,
            prompt_chars: null,
          },
        ],
        errors: [],
      },
    ]);
    const [s] = await loadSessions();
    expect(s.messages[0].stats).toBeUndefined();
  });

  it("maps all four stats columns into Message.stats", async () => {
    invokeMock.mockResolvedValue([
      {
        ...session,
        messages: [
          {
            id: "m1",
            session_id: "s1",
            role: "assistant",
            content: "hi",
            model_id: null,
            created_at: 2,
            finish_reason: "stop",
            time_to_first_token_ms: 120,
            total_time_ms: 900,
            token_count: 42,
            prompt_chars: 7,
          },
        ],
        errors: [],
      },
    ]);
    const [s] = await loadSessions();
    expect(s.messages[0].stats).toEqual({
      timeToFirstToken: 120,
      totalTime: 900,
      tokenCount: 42,
      promptChars: 7,
    });
  });

  it("saves stats as snake_case columns, and null when absent", async () => {
    invokeMock.mockResolvedValue(undefined);
    await saveMessage("s1", {
      id: "m1",
      role: "assistant",
      content: "hi",
      timestamp: 2,
      stats: { timeToFirstToken: 120, totalTime: 900, tokenCount: 42, promptChars: 7 },
    });
    expect(invokeMock).toHaveBeenLastCalledWith("save_message", {
      sessionId: "s1",
      message: expect.objectContaining({
        time_to_first_token_ms: 120,
        total_time_ms: 900,
        token_count: 42,
        prompt_chars: 7,
      }),
    });

    await saveMessage("s1", { id: "m2", role: "user", content: "q", timestamp: 1 });
    expect(invokeMock).toHaveBeenLastCalledWith("save_message", {
      sessionId: "s1",
      message: expect.objectContaining({
        time_to_first_token_ms: null,
        total_time_ms: null,
        token_count: null,
        prompt_chars: null,
      }),
    });
  });

  it("returns errors as error messages placed by time", async () => {
    invokeMock.mockResolvedValue([
      {
        ...session,
        messages: [
          {
            id: "m1",
            session_id: "s1",
            role: "user",
            content: "q",
            model_id: null,
            created_at: 1,
            finish_reason: null,
          },
          {
            id: "m2",
            session_id: "s1",
            role: "assistant",
            content: "partial",
            model_id: null,
            created_at: 2,
            finish_reason: null,
          },
        ],
        errors: [
          { id: "e1", session_id: "s1", message_id: "m2", error: "stream broke", created_at: 3 },
          { id: "e2", session_id: "s1", message_id: null, error: "no reply", created_at: 0 },
        ],
      },
    ]);
    const [s] = await loadSessions();
    expect(s.messages.map((m) => m.id)).toEqual(["e2", "m1", "m2", "e1"]);
    const err = s.messages.find((m) => m.id === "e1");
    expect(err).toMatchObject({
      role: "assistant",
      content: "⚠️ Error: stream broke",
      isError: true,
    });
    expect(s.messages.filter((m) => m.id === "m2")).toHaveLength(1);
  });
});

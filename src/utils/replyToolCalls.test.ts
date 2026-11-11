import { describe, expect, it } from "vitest";
import type { ChatToolCall, Message } from "../types";
import { replyWithToolCalls } from "./replyToolCalls";

const call: ChatToolCall = { id: "c1", name: "list_directory", arguments: '{"path":"C:\\\\"}' };

const fresh: Message = { id: "new", role: "assistant", content: "", timestamp: 2 };

describe("replyWithToolCalls", () => {
  it("puts the calls on the reply the stream wrote", () => {
    const reply: Message = { id: "r1", role: "assistant", content: "Let me look.", timestamp: 1 };
    const result = replyWithToolCalls(reply, [call], fresh);
    expect(result.isNew).toBe(false);
    expect(result.message.id).toBe("r1");
    expect(result.message.content).toBe("Let me look.");
    expect(result.message.toolCalls).toEqual([call]);
  });

  it("makes a new reply when the last message is the user's prompt", () => {
    const prompt: Message = { id: "u1", role: "user", content: "list C", timestamp: 1 };
    const result = replyWithToolCalls(prompt, [call], fresh);
    expect(result.isNew).toBe(true);
    expect(result.message).toEqual({ ...fresh, toolCalls: [call] });
  });

  it("makes a new reply after a tool row, so the next text is a separate reply", () => {
    const toolRow: Message = {
      id: "t1",
      role: "tool",
      kind: "tool",
      content: "ok",
      timestamp: 1,
    };
    expect(replyWithToolCalls(toolRow, [call], fresh).isNew).toBe(true);
  });

  it("makes a new reply when nothing has been written", () => {
    const result = replyWithToolCalls(undefined, [call], fresh);
    expect(result.isNew).toBe(true);
    expect(result.message.toolCalls).toEqual([call]);
  });

  it("does not treat an error row as the stream's reply", () => {
    const error: Message = {
      id: "e1",
      role: "assistant",
      content: "boom",
      timestamp: 1,
      isError: true,
    };
    expect(replyWithToolCalls(error, [call], fresh).isNew).toBe(true);
  });
});

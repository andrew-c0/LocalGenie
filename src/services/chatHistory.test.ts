import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentRef, ChatMessageContent, ChatToolCall, Message } from "../types";

const fileExists = vi.fn();
vi.mock("./system", () => ({
  fileExists: (path: string) => fileExists(path),
}));

const readAttachment = vi.fn();
vi.mock("./attachments", () => ({
  readAttachment: (path: string) => readAttachment(path),
}));

vi.mock("../utils/toast", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { historyFor } from "./chatHistory";

const readImage: ChatToolCall = {
  id: "c1",
  name: "read_image",
  arguments: '{"path":"C:\\\\notes\\\\a.png"}',
};

/** An assistant reply that made the given calls. */
function reply(calls: ChatToolCall[], content = ""): Message {
  return { id: "r1", role: "assistant", content, timestamp: 2, toolCalls: calls };
}

/** The `tool` row that answers one call, with the image it kept. */
function toolRow(id: string, callId: string, attachments?: AttachmentRef[]): Message {
  return {
    id,
    role: "tool",
    kind: "tool",
    content: "Image read",
    timestamp: 3,
    toolRecord: { callId, name: "read_image", arguments: "{}", status: "ok", approval: "auto" },
    attachments,
  };
}

/** A stored image reference at `C:\notes\<name>`. */
function imageRef(id: string, name: string): AttachmentRef {
  return { id, kind: "image", name, size: 0, path: `C:\\notes\\${name}` };
}

/** How many image parts a sent message carries. */
function imageParts(content: ChatMessageContent): number {
  return Array.isArray(content) ? content.filter((part) => part.type === "image_url").length : 0;
}

const prompt: Message = { id: "u1", role: "user", content: "What is in it?", timestamp: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  fileExists.mockResolvedValue(true);
  readAttachment.mockImplementation(async (path: string) => ({
    kind: "image",
    name: path.split("\\").pop() ?? path,
    size: 10,
    path,
    mime: "image/png",
    data: "DATA",
    text: null,
  }));
});

describe("historyFor with images from tool results", () => {
  it("sends the image as one user message after the tool results, in order", async () => {
    const messages = [
      prompt,
      reply([readImage]),
      toolRow("t1", "c1", [imageRef("ref-1", "a.png")]),
    ];

    const { history, unavailable } = await historyFor(messages);

    expect(history.map((m) => m.role)).toEqual(["user", "assistant", "tool", "user"]);
    expect(history[2]).toMatchObject({ role: "tool", tool_call_id: "c1" });
    expect(history[3].content).toEqual([
      { type: "text", text: "Image(s) from the tool call(s) above:" },
      { type: "image_url", image_url: { url: "data:image/png;base64,DATA" } },
    ]);
    expect(unavailable).toEqual([]);
  });

  it("puts one image message after the last result of a group, then the reply", async () => {
    const second: ChatToolCall = { id: "c2", name: "read_image", arguments: "{}" };
    const finalReply: Message = {
      id: "r2",
      role: "assistant",
      content: "A cat and a dog.",
      timestamp: 4,
    };
    const messages = [
      prompt,
      reply([readImage, second]),
      toolRow("t1", "c1", [imageRef("ref-1", "a.png")]),
      toolRow("t2", "c2", [imageRef("ref-2", "b.png")]),
      finalReply,
    ];

    const { history } = await historyFor(messages);

    expect(history.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "tool",
      "user",
      "assistant",
    ]);
    expect(imageParts(history[4].content)).toBe(2);
  });

  it("adds nothing for tool results that carry no image", async () => {
    const messages = [prompt, reply([readImage]), toolRow("t1", "c1")];

    const { history } = await historyFor(messages);

    expect(history.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
    expect(readAttachment).not.toHaveBeenCalled();
  });

  it("names a file no longer on the device, and sends the rest", async () => {
    const second: ChatToolCall = { id: "c2", name: "read_image", arguments: "{}" };
    fileExists.mockImplementation(async (path: string) => !path.endsWith("gone.png"));
    const messages = [
      prompt,
      reply([readImage, second]),
      toolRow("t1", "c1", [imageRef("ref-1", "gone.png")]),
      toolRow("t2", "c2", [imageRef("ref-2", "b.png")]),
    ];

    const { history, unavailable } = await historyFor(messages);

    expect(unavailable).toEqual(["gone.png"]);
    expect(imageParts(history[4].content)).toBe(1);
    expect(readAttachment).toHaveBeenCalledTimes(1);
  });

  it("sends no image message, and names the file, when every image is gone", async () => {
    fileExists.mockResolvedValue(false);
    const messages = [
      prompt,
      reply([readImage]),
      toolRow("t1", "c1", [imageRef("ref-1", "a.png")]),
    ];

    const { history, unavailable } = await historyFor(messages);

    expect(history.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
    expect(unavailable).toEqual(["a.png"]);
  });
});

describe("historyFor thinking and errors", () => {
  const user = (id: string, content: string): Message => ({
    id,
    role: "user",
    content,
    timestamp: 1,
  });
  const answer = (id: string, content: string): Message => ({
    id,
    role: "assistant",
    content,
    timestamp: 2,
  });
  const errorLine: Message = {
    id: "e1",
    role: "assistant",
    content: "⚠️ Error: Server returned 400",
    timestamp: 3,
    isError: true,
  };

  it("sends an earlier reply without its thinking", async () => {
    const messages = [
      user("u1", "first"),
      answer("a1", "<think>weighing it</think>One."),
      user("u2", "second"),
    ];

    const { history } = await historyFor(messages);

    expect(history.map((m) => m.content)).toEqual(["first", "One.", "second"]);
  });

  it("keeps the thinking of the current turn, tool rounds included", async () => {
    const call: ChatToolCall = { id: "c1", name: "read_text_file", arguments: "{}" };
    const toolReply: Message = {
      id: "r1",
      role: "assistant",
      content: "<think>plan</think>",
      timestamp: 3,
      toolCalls: [call],
    };
    const toolResult: Message = {
      id: "t1",
      role: "tool",
      kind: "tool",
      content: "file text",
      timestamp: 4,
      toolRecord: {
        callId: "c1",
        name: "read_text_file",
        arguments: "{}",
        status: "ok",
        approval: "auto",
      },
    };
    const messages = [
      user("u1", "first"),
      answer("a1", "<think>old</think>One."),
      user("u2", "read it"),
      toolReply,
      toolResult,
      answer("a2", "<think>sum up</think>Done."),
    ];

    const { history } = await historyFor(messages);

    expect(history.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(history[1].content).toBe("One.");
    expect(history[3].content).toBe("<think>plan</think>");
    expect(history[5].content).toBe("<think>sum up</think>Done.");
  });

  it("sends the original text when an earlier answer is empty and it made no calls", async () => {
    const messages = [
      user("u1", "first"),
      answer("a1", "<think>only thinking</think>"),
      user("u2", "next"),
    ];

    const { history } = await historyFor(messages);

    expect(history[1].content).toBe("<think>only thinking</think>");
  });

  it("sends an earlier reply with calls and no answer as empty text, with its calls", async () => {
    const call: ChatToolCall = { id: "c1", name: "read_text_file", arguments: "{}" };
    const messages: Message[] = [
      user("u1", "first"),
      {
        id: "a1",
        role: "assistant",
        content: "<think>plan</think>",
        timestamp: 2,
        toolCalls: [call],
      },
      {
        id: "t1",
        role: "tool",
        kind: "tool",
        content: "file text",
        timestamp: 3,
        toolRecord: {
          callId: "c1",
          name: "read_text_file",
          arguments: "{}",
          status: "ok",
          approval: "auto",
        },
      },
      answer("a2", "Final."),
      user("u2", "next"),
    ];

    const { history } = await historyFor(messages);

    expect(history[1]).toMatchObject({ role: "assistant", content: "" });
    expect(history[1].tool_calls).toHaveLength(1);
  });

  it("does not send an error line", async () => {
    const messages = [user("u1", "first"), errorLine, user("u2", "second")];

    const { history } = await historyFor(messages);

    expect(history.map((m) => m.content)).toEqual(["first", "second"]);
  });
});

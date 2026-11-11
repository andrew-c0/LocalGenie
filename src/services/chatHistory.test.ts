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

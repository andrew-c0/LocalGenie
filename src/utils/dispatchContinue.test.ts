import { describe, expect, it } from "vitest";
import type { ChatToolCall, Message } from "../types";
import { continueAction, finalAnswerOf } from "./dispatchContinue";

function message(role: Message["role"], content: string, extra: Partial<Message> = {}): Message {
  return { id: `${role}-${content}`, role, content, timestamp: 1, ...extra };
}

const call: ChatToolCall = { id: "c1", name: "read_text_file", arguments: "{}" };
const summary = message("system", "Earlier work.", { kind: "system", systemType: "summary" });

describe("continueAction", () => {
  it.each<[string, Message[], "finished" | "run"]>([
    ["no messages", [], "run"],
    ["a user message last", [message("user", "Write it")], "run"],
    [
      "a final reply with text",
      [message("user", "Write it"), message("assistant", "Here it is.")],
      "finished",
    ],
    [
      "a final reply followed by a summary line only",
      [message("user", "Write it"), message("assistant", "Here it is."), summary],
      "finished",
    ],
    [
      "a final reply with an answer after its thinking block",
      [message("user", "Write it"), message("assistant", "<think>plan</think>Here it is.")],
      "finished",
    ],
    ["a reply with an empty text", [message("user", "Write it"), message("assistant", "")], "run"],
    [
      "a reply with only spaces",
      [message("user", "Write it"), message("assistant", "   \n ")],
      "run",
    ],
    [
      "a reply with a thinking block still open and no answer",
      [message("user", "Write it"), message("assistant", "<think>still thinking")],
      "run",
    ],
    [
      "a reply that made tool calls",
      [message("user", "Read it"), message("assistant", "Reading.", { toolCalls: [call] })],
      "run",
    ],
    [
      "a reply with calls and no text",
      [message("user", "Read it"), message("assistant", "", { toolCalls: [call] })],
      "run",
    ],
    [
      "a tool result last",
      [
        message("user", "Read it"),
        message("assistant", "Reading.", { toolCalls: [call] }),
        message("tool", "file text", { kind: "tool" }),
      ],
      "run",
    ],
    [
      "an error line last, after a reply",
      [message("user", "Write it"), message("assistant", "Here it is."), errorLine()],
      "run",
    ],
    [
      "a user message after the final reply",
      [message("user", "Write it"), message("assistant", "Here it is."), message("user", "More?")],
      "run",
    ],
  ])("%s", (_, messages, expected) => {
    expect(continueAction(messages)).toBe(expected);
  });
});

describe("finalAnswerOf", () => {
  it("is the trimmed text of the final reply, without its thinking block", () => {
    const messages = [
      message("user", "Write it"),
      message("assistant", "<think>plan</think>  Here it is.  "),
    ];
    expect(finalAnswerOf(messages)).toBe("Here it is.");
  });

  it("is empty when the conversation is not finished", () => {
    expect(finalAnswerOf([message("user", "Write it")])).toBe("");
  });
});

function errorLine(): Message {
  return message("assistant", "Something failed.", { isError: true });
}

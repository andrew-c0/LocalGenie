import { describe, expect, it } from "vitest";
import type { Message, ToolRecord } from "../types";
import { pairedToolHistory } from "./toolHistory";

function userMsg(id: string, content = "question"): Message {
  return { id, role: "user", content, timestamp: 1 };
}

function reply(id: string, content: string, toolCalls?: Message["toolCalls"]): Message {
  return { id, role: "assistant", content, timestamp: 1, toolCalls };
}

function callOf(id: string, name = "read_text_file") {
  return { id, name, arguments: '{"path":"a.txt"}' };
}

function resultOf(
  id: string,
  callId: string,
  content = "file text",
  name = "read_text_file",
): Message {
  const toolRecord: ToolRecord = {
    callId,
    name,
    arguments: '{"path":"a.txt"}',
    status: "ok",
    approval: "auto",
  };
  return { id, role: "tool", kind: "tool", content, timestamp: 1, toolRecord };
}

function ids(messages: Message[]): string[] {
  return messages.map((m) => m.id);
}

describe("pairedToolHistory", () => {
  it("sends a call and its result in order", () => {
    const messages = [
      userMsg("u1"),
      reply("a1", "", [callOf("c1")]),
      resultOf("t1", "c1"),
      reply("a2", "The file says hi."),
    ];
    const sent = pairedToolHistory(messages);
    expect(ids(sent)).toEqual(["u1", "a1", "t1", "a2"]);
    expect(sent[1].toolCalls).toEqual([callOf("c1")]);
  });

  it("drops a call that has no result, and sends the reply as plain text when none is left", () => {
    const messages = [reply("a1", "Let me check.", [callOf("c1")])];
    const sent = pairedToolHistory(messages);
    expect(ids(sent)).toEqual(["a1"]);
    expect(sent[0].toolCalls).toBeUndefined();
    expect(sent[0].content).toBe("Let me check.");
  });

  it("drops a result whose call is not in the request", () => {
    const messages = [userMsg("u1"), resultOf("t1", "c9")];
    expect(ids(pairedToolHistory(messages))).toEqual(["u1"]);
  });

  it("drops a result that follows a reply with no calls", () => {
    const messages = [reply("a1", "plain"), resultOf("t1", "c1")];
    expect(ids(pairedToolHistory(messages))).toEqual(["a1"]);
  });

  it("keeps both calls when both have results, in the order of the results", () => {
    const messages = [
      reply("a1", "", [callOf("c1"), callOf("c2", "list_directory")]),
      resultOf("t1", "c1"),
      resultOf("t2", "c2", "listing", "list_directory"),
    ];
    const sent = pairedToolHistory(messages);
    expect(ids(sent)).toEqual(["a1", "t1", "t2"]);
    expect(sent[0].toolCalls?.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("keeps the answered call and drops the one without a result", () => {
    const messages = [reply("a1", "", [callOf("c1"), callOf("c2")]), resultOf("t2", "c2")];
    const sent = pairedToolHistory(messages);
    expect(ids(sent)).toEqual(["a1", "t2"]);
    expect(sent[0].toolCalls?.map((c) => c.id)).toEqual(["c2"]);
  });

  it("keeps assistant text with its calls", () => {
    const messages = [reply("a1", "Checking the folder.", [callOf("c1")]), resultOf("t1", "c1")];
    const sent = pairedToolHistory(messages);
    expect(sent[0].content).toBe("Checking the folder.");
    expect(sent[0].toolCalls).toHaveLength(1);
  });

  it("pairs a result with empty content", () => {
    const messages = [reply("a1", "", [callOf("c1")]), resultOf("t1", "c1", "")];
    const sent = pairedToolHistory(messages);
    expect(ids(sent)).toEqual(["a1", "t1"]);
    expect(sent[1].content).toBe("");
  });

  it("does not pair a result that comes after a message that ends the run", () => {
    const messages = [reply("a1", "", [callOf("c1")]), userMsg("u2"), resultOf("t1", "c1")];
    const sent = pairedToolHistory(messages);
    expect(ids(sent)).toEqual(["a1", "u2"]);
    expect(sent[0].toolCalls).toBeUndefined();
  });

  it("drops a tool row with no record, since it cannot be paired", () => {
    const bare: Message = { id: "t1", role: "tool", kind: "tool", content: "x", timestamp: 1 };
    const messages = [reply("a1", "", [callOf("c1")]), bare];
    expect(ids(pairedToolHistory(messages))).toEqual(["a1"]);
  });

  it("lets one result answer one call only, even when two calls share an id", () => {
    const messages = [reply("a1", "", [callOf("c1"), callOf("c1")]), resultOf("t1", "c1")];
    const sent = pairedToolHistory(messages);
    expect(ids(sent)).toEqual(["a1", "t1"]);
    expect(sent[0].toolCalls).toHaveLength(1);
  });

  it("does not change the messages it was given", () => {
    const original = reply("a1", "", [callOf("c1"), callOf("c2")]);
    pairedToolHistory([original, resultOf("t1", "c1")]);
    expect(original.toolCalls).toHaveLength(2);
  });
});

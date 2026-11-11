import { describe, expect, it } from "vitest";
import type { Message, ToolRecord } from "../types";
import {
  isReplyMessage,
  isToolMessage,
  parseJsonObject,
  parseToolCalls,
  parseToolRecord,
  serialiseToolCalls,
  serialiseToolRecord,
  toolCallText,
  toolResultText,
} from "./toolRecords";

const record: ToolRecord = {
  callId: "c1",
  name: "read_text_file",
  arguments: '{"path":"notes.txt"}',
  status: "ok",
  approval: "auto",
  durationMs: 12,
};

describe("parseToolCalls", () => {
  it("reads a stored list of calls", () => {
    const raw = JSON.stringify([{ id: "c1", name: "read_text_file", arguments: "{}" }]);
    expect(parseToolCalls(raw)).toEqual([{ id: "c1", name: "read_text_file", arguments: "{}" }]);
  });

  it("reads as none when the value is missing, empty or not JSON", () => {
    expect(parseToolCalls(null)).toBeUndefined();
    expect(parseToolCalls(undefined)).toBeUndefined();
    expect(parseToolCalls("")).toBeUndefined();
    expect(parseToolCalls("{not json")).toBeUndefined();
    expect(parseToolCalls("[]")).toBeUndefined();
  });

  it("reads as none when the JSON is not a list", () => {
    expect(parseToolCalls('{"id":"c1"}')).toBeUndefined();
    expect(parseToolCalls('"text"')).toBeUndefined();
  });

  it("skips entries that are not calls and keeps the rest", () => {
    const raw = JSON.stringify([
      { id: "c1", name: "web_search", arguments: "{}" },
      { id: 7, name: "x", arguments: "{}" },
      null,
      { id: "c2", name: "web_fetch" },
    ]);
    expect(parseToolCalls(raw)).toEqual([{ id: "c1", name: "web_search", arguments: "{}" }]);
  });
});

describe("parseToolRecord", () => {
  it("reads a complete record", () => {
    expect(parseToolRecord(JSON.stringify(record))).toEqual(record);
  });

  it("keeps the optional fields when they are set", () => {
    const raw = JSON.stringify({ ...record, truncated: true });
    expect(parseToolRecord(raw)).toEqual({ ...record, truncated: true });
  });

  it("drops an optional field of the wrong type without refusing the record", () => {
    const raw = JSON.stringify({ ...record, durationMs: "fast", truncated: "yes" });
    const parsed = parseToolRecord(raw);
    expect(parsed).toEqual({
      callId: "c1",
      name: "read_text_file",
      arguments: '{"path":"notes.txt"}',
      status: "ok",
      approval: "auto",
    });
  });

  it("refuses unknown statuses and approvals", () => {
    expect(parseToolRecord(JSON.stringify({ ...record, status: "maybe" }))).toBeUndefined();
    expect(parseToolRecord(JSON.stringify({ ...record, approval: "always" }))).toBeUndefined();
  });

  it("refuses a record missing a required field", () => {
    const { callId: _callId, ...withoutId } = record;
    expect(parseToolRecord(JSON.stringify(withoutId))).toBeUndefined();
  });

  it("reads as none for bad JSON, a missing value or a non-object", () => {
    expect(parseToolRecord(null)).toBeUndefined();
    expect(parseToolRecord("{broken")).toBeUndefined();
    expect(parseToolRecord("[1,2]")).toBeUndefined();
  });
});

describe("serialise helpers", () => {
  it("stores nothing for no calls or no record", () => {
    expect(serialiseToolCalls(undefined)).toBeNull();
    expect(serialiseToolCalls([])).toBeNull();
    expect(serialiseToolRecord(undefined)).toBeNull();
  });

  it("round-trips calls and a record through the parsers", () => {
    const calls = [{ id: "c1", name: "web_search", arguments: '{"query":"x"}' }];
    expect(parseToolCalls(serialiseToolCalls(calls))).toEqual(calls);
    expect(parseToolRecord(serialiseToolRecord(record))).toEqual(record);
  });
});

describe("parseJsonObject", () => {
  it("returns the object, or null for anything else", () => {
    expect(parseJsonObject('{"path":"a"}')).toEqual({ path: "a" });
    expect(parseJsonObject("[1]")).toBeNull();
    expect(parseJsonObject("nope")).toBeNull();
  });
});

function msg(role: Message["role"], extra: Partial<Message> = {}): Message {
  return { id: "m", role, content: "", timestamp: 1, ...extra };
}

describe("isToolMessage and isReplyMessage", () => {
  it("recognises a tool row by its role or its kind", () => {
    expect(isToolMessage(msg("tool"))).toBe(true);
    expect(isToolMessage(msg("assistant", { kind: "tool" }))).toBe(true);
    expect(isToolMessage(msg("assistant"))).toBe(false);
  });

  it("counts an assistant reply, and not a tool row, an error or a system line", () => {
    expect(isReplyMessage(msg("assistant"))).toBe(true);
    expect(isReplyMessage(msg("tool"))).toBe(false);
    expect(isReplyMessage(msg("assistant", { isError: true }))).toBe(false);
    expect(isReplyMessage(msg("assistant", { kind: "system" }))).toBe(false);
    expect(isReplyMessage(msg("user"))).toBe(false);
  });
});

describe("transcript text", () => {
  it("writes a call as plain text with its arguments", () => {
    expect(toolCallText({ name: "read_text_file", arguments: ' {"path":"a"} ' })).toBe(
      'Called read_text_file with {"path":"a"}',
    );
  });

  it("writes an empty argument list as {}", () => {
    expect(toolCallText({ name: "web_search", arguments: " " })).toBe("Called web_search with {}");
  });

  it("writes a result with the tool's name", () => {
    expect(toolResultText(parseToolRecord(JSON.stringify(record)), " hello ")).toBe(
      "Tool read_text_file result: hello",
    );
  });

  it("marks an empty result and a result with no known tool", () => {
    expect(toolResultText(undefined, "")).toBe("Tool unknown result: (no output)");
  });
});

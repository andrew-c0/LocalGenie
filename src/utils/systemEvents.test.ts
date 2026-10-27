import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import { contextUsageOf } from "./contextUsage";
import {
  alreadyShown,
  isModelChange,
  isSystemEvent,
  MODEL_CHANGED,
  modelChangedContent,
  parseSystemContent,
} from "./systemEvents";

const chat = (id: string, content: string): Message => ({
  id,
  role: "user",
  content,
  timestamp: 1,
});

describe("model changed content", () => {
  it("keeps the model, the compute target and a readable text", () => {
    const fields = parseSystemContent(modelChangedContent("unsloth/gemma-4-E2B-it-GGUF", "npu"));
    expect(fields).toEqual({
      text: "Model: gemma-4-E2B-it-GGUF on NPU",
      model: "unsloth/gemma-4-E2B-it-GGUF",
      compute: "npu",
    });
  });

  it("leaves the compute target out of the text when it is unknown", () => {
    const fields = parseSystemContent(modelChangedContent("org/model", null));
    expect(fields.text).toBe("Model: model");
  });

  it("reads nothing from content that is not a JSON object", () => {
    expect(parseSystemContent("plain text")).toEqual({});
    expect(parseSystemContent("[1,2]")).toEqual({});
  });
});

describe("system lines", () => {
  it("are told apart from chat messages", () => {
    const line: Message = {
      id: "s",
      role: "system",
      kind: "system",
      systemType: MODEL_CHANGED,
      content: "{}",
      timestamp: 1,
    };
    expect(isSystemEvent(line)).toBe(true);
    expect(isSystemEvent(chat("u", "hi"))).toBe(false);
  });

  it("do not count toward the context in use", () => {
    const line: Message = {
      id: "s",
      role: "system",
      kind: "system",
      systemType: MODEL_CHANGED,
      content: "x".repeat(4000),
      timestamp: 2,
    };
    const without = contextUsageOf([chat("u", "hello")]);
    const withLine = contextUsageOf([chat("u", "hello"), line]);
    expect(withLine.total).toBe(without.total);
  });
});

describe("model change before a prompt", () => {
  it("is a change when the model or the compute target differs", () => {
    const npu = { model: "org/a", compute: "npu" };
    expect(isModelChange(npu, { model: "org/b", compute: "npu" })).toBe(true);
    expect(isModelChange(npu, { model: "org/a", compute: "cpu" })).toBe(true);
  });

  it("is not a change when the model and compute target stay the same", () => {
    expect(
      isModelChange({ model: "org/a", compute: "npu" }, { model: "org/a", compute: "npu" }),
    ).toBe(false);
  });

  it("does not compare the compute target when the previous reply did not keep one", () => {
    expect(
      isModelChange({ model: "org/a", compute: null }, { model: "org/a", compute: "gpu" }),
    ).toBe(false);
  });
});

describe("repeated model change lines", () => {
  const line = (model: string, compute: string): Message => ({
    id: model,
    role: "system",
    kind: "system",
    systemType: MODEL_CHANGED,
    content: modelChangedContent(model, compute),
    timestamp: 1,
  });

  it("is shown when the latest line says the same model and compute", () => {
    expect(alreadyShown([line("org/a", "npu")], { model: "org/a", compute: "npu" })).toBe(true);
  });

  it("is not shown again after a line for another model or compute target", () => {
    expect(alreadyShown([line("org/a", "npu")], { model: "org/a", compute: "cpu" })).toBe(false);
    expect(
      alreadyShown([line("org/a", "npu"), line("org/b", "npu")], {
        model: "org/a",
        compute: "npu",
      }),
    ).toBe(false);
  });
});

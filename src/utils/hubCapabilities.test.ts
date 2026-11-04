import { describe, expect, it } from "vitest";
import { inferredCapabilities, inferredCapabilityBadges } from "./hubCapabilities";

const NONE = { vision: false, tools: false, thinking: false };

describe("inferredCapabilities", () => {
  it("reads vision from the vision or multimodal tag", () => {
    expect(inferredCapabilities({ tags: ["vision"] }).vision).toBe(true);
    expect(inferredCapabilities({ tags: ["gguf", "multimodal"] }).vision).toBe(true);
  });

  it("reads vision from the image-text pipeline tags", () => {
    expect(inferredCapabilities({ pipeline_tag: "image-text-to-text" }).vision).toBe(true);
    expect(inferredCapabilities({ pipeline_tag: "visual-question-answering" }).vision).toBe(true);
    expect(inferredCapabilities({ pipeline_tag: "any-to-any" }).vision).toBe(true);
  });

  it("does not call a text-only model vision", () => {
    expect(inferredCapabilities({ tags: ["gguf"], pipeline_tag: "text-generation" }).vision).toBe(
      false,
    );
  });

  it("reads tool calls from the chat template words", () => {
    expect(
      inferredCapabilities({ gguf: { chat_template: "{% if tools %}x{% endif %}" } }).tools,
    ).toBe(true);
    expect(
      inferredCapabilities({ gguf: { chat_template: "<tool_call>{{ call }}</tool_call>" } }).tools,
    ).toBe(true);
  });

  it("reads thinking from the chat template words, in any case", () => {
    const thinking = (chat_template: string) => inferredCapabilities({ gguf: { chat_template } });
    expect(thinking("{% if enable_thinking %}<think>{% endif %}").thinking).toBe(true);
    expect(thinking("<|think|>").thinking).toBe(true);
    expect(thinking("message.Reasoning_Content").thinking).toBe(true);
    expect(thinking("{{ messages }}").thinking).toBe(false);
  });

  it("treats a missing template as unknown: tools and thinking are false", () => {
    expect(inferredCapabilities({ tags: ["gguf"] })).toEqual(NONE);
    expect(inferredCapabilities({ gguf: {} })).toEqual(NONE);
    expect(inferredCapabilities({})).toEqual(NONE);
  });

  it("keeps the three flags independent", () => {
    const got = inferredCapabilities({
      tags: ["vision"],
      gguf: { chat_template: "{% if tools %}{% endif %}" },
    });
    expect(got).toEqual({ vision: true, tools: true, thinking: false });
  });
});

describe("inferredCapabilityBadges", () => {
  it("gives no badge when nothing is inferred", () => {
    expect(inferredCapabilityBadges(NONE)).toEqual([]);
  });

  it("labels tools and thinking as inferred from the chat template", () => {
    const badges = inferredCapabilityBadges({ vision: false, tools: true, thinking: true });
    expect(badges.map((b) => b.id)).toEqual(["tools", "thinking"]);
    for (const badge of badges) {
      expect(badge.label).toMatch(/\(inferred from the chat template\)$/);
    }
  });

  it("labels vision as inferred from the model's tags", () => {
    expect(inferredCapabilityBadges({ vision: true, tools: false, thinking: false })).toEqual([
      { id: "vision", label: "Vision: reads images (inferred from the model's tags)" },
    ]);
  });

  it("lists the badges in the selector's order: tools, thinking, vision", () => {
    const badges = inferredCapabilityBadges({ vision: true, tools: true, thinking: true });
    expect(badges.map((b) => b.id)).toEqual(["tools", "thinking", "vision"]);
  });
});

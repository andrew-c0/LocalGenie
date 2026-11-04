import { describe, expect, it } from "vitest";
import type { AihubCardInfo, AihubCatalogEntry } from "../../../services/aihub";
import type { DbDownloadedModel } from "../../../services/database";
import type { ModelInfo } from "../../../types";
import { serializeFacets } from "../../../utils/hubModelInfo";
import { aihubCardData, factTooltipText, hubCardData, localCardData } from "./modelCardData";

const GB = 1_073_741_824;

const MODEL: ModelInfo = { name: "org/model", size: "4.0 GB", source: "hf", precisions: ["Q4_0"] };

function row(overrides: Partial<DbDownloadedModel> = {}): DbDownloadedModel {
  return {
    name: "org/model",
    precision: "Q4_0",
    context_size: 8192,
    param_count: 7_600_000_000,
    repo_url: null,
    model_card: null,
    facets: serializeFacets({
      task: "text-generation",
      library: "gguf",
      license: "apache-2.0",
      paramCount: 7_600_000_000,
      paramCountApproximate: false,
      baseRelation: null,
      baseRepo: null,
      quantBits: [4],
    }),
    base_ram_bytes: 3 * GB,
    context_ram_bytes: 1 * GB,
    ram_approximate: false,
    ...overrides,
  };
}

describe("factTooltipText", () => {
  it("names the fact and gives its value", () => {
    expect(factTooltipText({ kind: "ctx", text: "8K" })).toBe("Context window: 8K");
    expect(factTooltipText({ kind: "disk", text: "429 MB" })).toBe("Size on disk: 429 MB");
  });

  it("adds the note in brackets when there is one", () => {
    expect(factTooltipText({ kind: "params", text: "0.6B", note: "approximate" })).toBe(
      "Parameters: 0.6B (approximate)",
    );
    expect(factTooltipText({ kind: "quant", text: "Q4_K_M" })).toBe("Quantisation: Q4_K_M");
  });
});

describe("localCardData", () => {
  it("shows the facts of a stored row in order, with the RAM badge and the source", () => {
    const card = localCardData(MODEL, row(), []);
    expect(card.facts.map((f) => [f.kind, f.text])).toEqual([
      ["task", "Text generation"],
      ["params", "7.6B"],
      ["quant", "Q4_0"],
      ["ctx", "8K"],
      ["licence", "apache-2.0"],
      ["disk", "4.0 GB"],
    ]);
    expect(card.ramVerdict?.label).toBe("RAM ~4.00 GB");
    expect(card.details).toEqual(["Source: Hugging Face"]);
    expect(card.installed).toBe(true);
  });

  it("falls back to the parameter count when the facets have no size", () => {
    const card = localCardData(MODEL, row({ facets: null }), []);
    expect(card.facts.find((f) => f.kind === "params")?.text).toBe("7.6B");
    expect(card.facts.find((f) => f.kind === "task")).toBeUndefined();
    expect(card.facts.find((f) => f.kind === "licence")).toBeUndefined();
  });

  it("omits the facts and the RAM badge a row does not have", () => {
    const card = localCardData(
      MODEL,
      row({ facets: null, context_size: null, param_count: null, base_ram_bytes: null }),
      [],
    );
    expect(card.facts.map((f) => f.kind)).toEqual(["quant", "disk"]);
    expect(card.ramVerdict).toBeNull();
  });

  it("reads the precision from the model when the row has none", () => {
    const card = localCardData(MODEL, row({ precision: null }), []);
    expect(card.facts.find((f) => f.kind === "quant")?.text).toBe("Q4_0");
  });

  it("passes the capability icons through", () => {
    const badges = [{ id: "tools" as const, label: "Tools" }];
    expect(localCardData(MODEL, row(), badges).capabilityBadges).toEqual(badges);
  });
});

describe("hubCardData", () => {
  const hub = {
    id: "org/model-GGUF",
    downloads: 1200,
    likes: 34,
    tags: ["license:apache-2.0", "vision"],
    pipeline_tag: "text-generation",
    safetensors: { total: 7_600_000_000 },
    gguf: { context_length: 8192 },
    lastModified: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  };

  it("builds the facts, the stats and the update time", () => {
    const card = hubCardData(hub, null);
    expect(card.facts.map((f) => [f.kind, f.text])).toEqual([
      ["task", "Text generation"],
      ["params", "7.6B"],
      ["ctx", "8K"],
      ["licence", "apache-2.0"],
    ]);
    expect(card.stats).toEqual({ downloads: 1200, likes: 34 });
    expect(card.updated?.relative).toBe("3 days ago");
    expect(card.capabilityBadges.map((b) => b.id)).toEqual(["vision"]);
    expect(card.installed).toBe(false);
  });

  it("hides the stats of a repo that is already downloaded", () => {
    expect(hubCardData(hub, null, true).stats).toBeUndefined();
  });

  it("has no RAM badge without the memory figures", () => {
    expect(hubCardData(hub, null).ramVerdict).toBeNull();
  });

  it("omits the context fact when the Hub gives no context length", () => {
    const card = hubCardData({ ...hub, gguf: undefined }, null);
    expect(card.facts.find((f) => f.kind === "ctx")).toBeUndefined();
  });
});

describe("aihubCardData", () => {
  const entry: AihubCatalogEntry = {
    id: "qwen3_0_6b",
    displayName: "Qwen3-0.6B",
    domain: "GENERATIVE_AI",
    useCase: "",
    isQuantized: true,
    runtimes: ["QAIRT"],
    chipsets: ["Snapdragon X Elite", "Snapdragon 8 Elite"],
    tags: [],
    summary: null,
  };
  const summary: AihubCardInfo = {
    headline: "Qwen3 0.6B for chat",
    modelSizeBytes: 429 * 1024 * 1024,
    quantization: "Q4_0 (GGUF)",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextLengths: "512, 1024, 4096",
    languages: null,
  };

  it("names the chipset count in the tooltip when there is no summary", () => {
    const card = aihubCardData(entry, null);
    expect(card.details).toEqual(["QAIRT · 2 chipsets"]);
    expect(card.facts).toEqual([]);
    expect(card.capabilityBadges).toEqual([]);
  });

  it("keeps the headline and the info lines in the tooltip, not as card text", () => {
    const card = aihubCardData({ ...entry, summary }, null);
    expect(card.details?.[0]).toBe("Qwen3 0.6B for chat");
    expect(card.details).toContain(
      "Q4_0 (GGUF) · 429.0 MB · text, image → text · Context 512, 1024, 4096",
    );
    expect(card.facts.map((f) => [f.kind, f.text])).toEqual([
      ["quant", "Q4_0 (GGUF)"],
      ["ctx", "4K"],
    ]);
    expect(card.capabilityBadges.map((b) => b.id)).toEqual(["vision"]);
  });
});

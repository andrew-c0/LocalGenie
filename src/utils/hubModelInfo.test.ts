import { describe, expect, it } from "vitest";
import {
  baseModelOf,
  facetSummaryFromModel,
  formatParamCount,
  licenseOf,
  paramCountOf,
  parseFacets,
  quantBitsOf,
  serializeFacets,
  sizeLabelOf,
  taskGroupOf,
  taskOf,
  libraryOf,
  taskLabel,
} from "./hubModelInfo";

describe("taskGroupOf", () => {
  it("groups a pipeline id by the static map", () => {
    expect(taskGroupOf("text-generation")).toBe("nlp");
    expect(taskGroupOf("image-text-to-text")).toBe("multimodal");
    expect(taskGroupOf("text-to-image")).toBe("cv");
    expect(taskGroupOf("automatic-speech-recognition")).toBe("audio");
    expect(taskGroupOf("tabular-regression")).toBe("tabular");
    expect(taskGroupOf("robotics")).toBe("rl");
    expect(taskGroupOf("graph-ml")).toBe("other");
  });

  it("puts an unlisted pipeline id under other", () => {
    expect(taskGroupOf("some-new-task")).toBe("other");
  });

  it("returns null when the model has no task", () => {
    expect(taskGroupOf(null)).toBeNull();
    expect(taskGroupOf(undefined)).toBeNull();
    expect(taskGroupOf("")).toBeNull();
  });
});

describe("taskLabel", () => {
  it("turns the pipeline id into a sentence", () => {
    expect(taskLabel("text-generation")).toBe("Text generation");
    expect(taskLabel("image-text-to-text")).toBe("Image text to text");
  });
});

describe("paramCountOf", () => {
  it("prefers the safetensors total and is exact", () => {
    expect(
      paramCountOf({ safetensors: { total: 7_615_616_512 }, gguf: { total: 1_800_000_000 } }),
    ).toEqual({ count: 7_615_616_512, approximate: false });
  });

  it("falls back to the GGUF total and marks it approximate", () => {
    expect(paramCountOf({ gguf: { total: 4_000_000_000 } })).toEqual({
      count: 4_000_000_000,
      approximate: true,
    });
  });

  it("returns null when neither total is reported", () => {
    expect(paramCountOf({ safetensors: {}, gguf: {} })).toBeNull();
    expect(paramCountOf({})).toBeNull();
  });
});

describe("formatParamCount", () => {
  it("formats billions with one decimal only when needed", () => {
    expect(formatParamCount(7_615_616_512)).toBe("7.6B");
    expect(formatParamCount(8_000_000_000)).toBe("8B");
    expect(formatParamCount(270_000_000)).toBe("270M");
    expect(formatParamCount(900)).toBe("900");
  });
});

describe("baseModelOf", () => {
  it("reads the relation and repo from a base_model tag", () => {
    expect(
      baseModelOf(["gguf", "base_model:quantized:Qwen/Qwen2.5-7B-Instruct", "license:mit"]),
    ).toEqual({ relation: "quantized", repo: "Qwen/Qwen2.5-7B-Instruct" });
    expect(baseModelOf(["base_model:adapter:org/lora"])).toEqual({
      relation: "adapter",
      repo: "org/lora",
    });
  });

  it("returns null for a base model with no base_model tag", () => {
    expect(baseModelOf(["transformers", "license:apache-2.0"])).toBeNull();
    expect(baseModelOf(undefined)).toBeNull();
  });

  it("ignores a base_model tag with an unknown relation", () => {
    expect(baseModelOf(["base_model:org/name"])).toBeNull();
  });
});

describe("licenseOf", () => {
  it("reads the id from the license tag", () => {
    expect(licenseOf(["license:apache-2.0", "gguf"])).toBe("apache-2.0");
    expect(licenseOf(["gguf"])).toBeNull();
    expect(licenseOf(undefined)).toBeNull();
  });
});

describe("quantBitsOf", () => {
  it("reads 4-bit and 8-bit tags, sorted and unique", () => {
    expect(quantBitsOf(["8-bit", "4-bit", "8-bit", "gguf"])).toEqual([4, 8]);
    expect(quantBitsOf(["6-bit"])).toEqual([]);
    expect(quantBitsOf(undefined)).toEqual([]);
  });
});

describe("facetSummaryFromModel", () => {
  it("builds the six facets from one Hub response", () => {
    const summary = facetSummaryFromModel({
      pipeline_tag: "text-generation",
      library_name: "transformers",
      tags: ["license:apache-2.0", "4-bit", "base_model:finetune:org/base", "text-generation"],
      safetensors: { total: 3_000_000_000 },
    });
    expect(summary).toEqual({
      task: "text-generation",
      library: "transformers",
      license: "apache-2.0",
      paramCount: 3_000_000_000,
      paramCountApproximate: false,
      baseRelation: "finetune",
      baseRepo: "org/base",
      quantBits: [4],
    });
  });

  it("uses null for facets the model does not report", () => {
    expect(facetSummaryFromModel({})).toEqual({
      task: null,
      library: null,
      license: null,
      paramCount: null,
      paramCountApproximate: false,
      baseRelation: null,
      baseRepo: null,
      quantBits: [],
    });
  });
});

describe("serializeFacets and parseFacets", () => {
  it("round-trips a summary", () => {
    const summary = facetSummaryFromModel({
      pipeline_tag: "image-text-to-text",
      tags: ["base_model:quantized:org/base", "8-bit"],
      gguf: { total: 1_000_000_000 },
    });
    expect(parseFacets(serializeFacets(summary))).toEqual(summary);
  });

  it("returns null for missing or unreadable text", () => {
    expect(parseFacets(null)).toBeNull();
    expect(parseFacets(undefined)).toBeNull();
    expect(parseFacets("")).toBeNull();
    expect(parseFacets("{not json")).toBeNull();
    expect(parseFacets("[1,2]")).toBeNull();
    expect(parseFacets('"text"')).toBeNull();
  });

  it("fills missing or wrong-typed fields with empty values", () => {
    expect(
      parseFacets('{"task":"text-generation","paramCount":"big","quantBits":[4,"x"]}'),
    ).toEqual({
      task: "text-generation",
      library: null,
      license: null,
      paramCount: null,
      paramCountApproximate: false,
      baseRelation: null,
      baseRepo: null,
      quantBits: [4],
    });
  });
});

describe("sizeLabelOf", () => {
  it("marks a GGUF-only size as approximate", () => {
    const base = facetSummaryFromModel({});
    expect(sizeLabelOf({ ...base, paramCount: 7_615_616_512, paramCountApproximate: true })).toBe(
      "~7.6B",
    );
    expect(sizeLabelOf({ ...base, paramCount: 7_615_616_512 })).toBe("7.6B");
    expect(sizeLabelOf(base)).toBeNull();
  });
});

describe("task and library from the tags", () => {
  it("uses the pipeline tag when the response has it", () => {
    expect(taskOf({ pipeline_tag: "image-text-to-text", tags: ["text-generation"] })).toBe(
      "image-text-to-text",
    );
  });

  it("falls back to the first known task among the tags", () => {
    const model = { tags: ["gguf", "conversational", "text-generation", "license:mit"] };
    expect(taskOf(model)).toBe("text-generation");
    expect(libraryOf(model)).toBe("gguf");
  });

  it("is null when the tags name no task or library", () => {
    expect(taskOf({ tags: ["region:us"] })).toBeNull();
    expect(libraryOf({ tags: ["region:us"] })).toBeNull();
  });
});

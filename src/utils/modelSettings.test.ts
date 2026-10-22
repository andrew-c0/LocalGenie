import { describe, expect, it } from "vitest";
import {
  chatSettingsFor,
  draftModelDisabledReason,
  engineOf,
  loadSettingDisabledReason,
  modelSettingsKey,
  resolveLoadParams,
  sameModel,
  sameServerOptions,
  usesDraftModel,
} from "./modelSettings";

describe("context window fallback", () => {
  it("uses the model's own context window when none is saved", () => {
    const params = resolveLoadParams({}, "llama_cpp", "npu", 40960);
    expect(params.nctx).toBe(40960);
  });

  it("prefers the saved context window over the model's own", () => {
    const params = resolveLoadParams({ nctx: 8192 }, "llama_cpp", "npu", 40960);
    expect(params.nctx).toBe(8192);
  });

  it("leaves the context window to the server when neither is known", () => {
    const params = resolveLoadParams({}, "llama_cpp", "npu", null);
    expect(params).not.toHaveProperty("nctx");
  });
});

describe("sameModel", () => {
  it("matches a model with and without its precision suffix", () => {
    expect(sameModel("Qwen3.5-0.8B-GGUF", "Qwen3.5-0.8B-GGUF:Q8_K_XL")).toBe(true);
  });

  it("does not match different models", () => {
    expect(sameModel("Qwen3.5-0.8B-GGUF", "unsloth/gemma-4-E4B-it-GGUF:Q4_1")).toBe(false);
  });
});

describe("modelSettingsKey", () => {
  it("strips the precision suffix", () => {
    expect(modelSettingsKey("org/repo:W4A16")).toBe("org/repo");
    expect(modelSettingsKey("org/repo")).toBe("org/repo");
  });
});

describe("engineOf", () => {
  it("uses QAIRT for AI Hub bundles and llama.cpp otherwise", () => {
    expect(engineOf({ source: "aihub" })).toBe("qairt");
    expect(engineOf({ source: "localfs" })).toBe("llama_cpp");
    expect(engineOf(undefined)).toBe("llama_cpp");
  });
});

describe("loadSettingDisabledReason", () => {
  it("disables llama.cpp-only settings on QAIRT", () => {
    expect(loadSettingDisabledReason("compute", "qairt", "npu")).toBeDefined();
    expect(loadSettingDisabledReason("nctx", "qairt", "npu")).toBeDefined();
    expect(loadSettingDisabledReason("ngl", "qairt", "npu")).toBeDefined();
    expect(loadSettingDisabledReason("spec", "qairt", "npu")).toBeDefined();
  });

  it("disables GPU layers on CPU but not on NPU or GPU", () => {
    expect(loadSettingDisabledReason("ngl", "llama_cpp", "cpu")).toBeDefined();
    expect(loadSettingDisabledReason("ngl", "llama_cpp", "npu")).toBeUndefined();
    expect(loadSettingDisabledReason("ngl", "llama_cpp", "gpu")).toBeUndefined();
  });

  it("enables everything on llama.cpp with a GPU or NPU target", () => {
    expect(loadSettingDisabledReason("compute", "llama_cpp", "gpu")).toBeUndefined();
    expect(loadSettingDisabledReason("nctx", "llama_cpp", "gpu")).toBeUndefined();
    expect(loadSettingDisabledReason("spec", "llama_cpp", "gpu")).toBeUndefined();
  });
});

describe("draftModelDisabledReason", () => {
  it("needs a speculation type, and only draft-* types take a draft model", () => {
    expect(draftModelDisabledReason("llama_cpp", undefined)).toBeDefined();
    expect(draftModelDisabledReason("llama_cpp", "ngram-simple")).toBeDefined();
    expect(draftModelDisabledReason("llama_cpp", "draft-mtp")).toBeUndefined();
    expect(draftModelDisabledReason("qairt", "draft-mtp")).toBeDefined();
    expect(usesDraftModel("draft-eagle3")).toBe(true);
    expect(usesDraftModel("ngram-cache")).toBe(false);
  });
});

describe("resolveLoadParams", () => {
  it("sends every load option for llama.cpp on NPU", () => {
    const params = resolveLoadParams({ nctx: 8192, ngl: 20 }, "llama_cpp", "npu");
    expect(params).toEqual({ compute: "npu", nctx: 8192, ngl: 20 });
  });

  it("leaves out disabled options so the server default applies", () => {
    const qairt = resolveLoadParams({ nctx: 8192, ngl: 20 }, "qairt", "npu");
    expect(qairt).not.toHaveProperty("compute");
    expect(qairt).not.toHaveProperty("nctx");
    expect(qairt).not.toHaveProperty("ngl");

    const cpu = resolveLoadParams({ ngl: 20 }, "llama_cpp", "cpu");
    expect(cpu).not.toHaveProperty("ngl");
    expect(cpu.compute).toBe("cpu");
  });

  it("uses the saved compute target over the fallback", () => {
    expect(resolveLoadParams({ compute: "gpu" }, "llama_cpp", "npu").compute).toBe("gpu");
  });

  it("sends power mode when set, and omits it when empty", () => {
    expect(resolveLoadParams({ powerMode: "high_performance" }, "qairt", "npu").powerMode).toBe(
      "high_performance",
    );
    expect(resolveLoadParams({ powerMode: "" }, "qairt", "npu")).not.toHaveProperty("powerMode");
  });

  it("sends speculation on llama.cpp only, and the draft model only for draft-* types", () => {
    const draft = resolveLoadParams(
      { specType: "draft-mtp", specDraftModel: "org/draft:Q4_0", specNMax: 3 },
      "llama_cpp",
      "npu",
    );
    expect(draft).toMatchObject({
      specType: "draft-mtp",
      specDraftModel: "org/draft:Q4_0",
      specNMax: 3,
    });

    const ngram = resolveLoadParams(
      { specType: "ngram-simple", specDraftModel: "org/draft:Q4_0" },
      "llama_cpp",
      "npu",
    );
    expect(ngram.specType).toBe("ngram-simple");
    expect(ngram).not.toHaveProperty("specDraftModel");

    const qairt = resolveLoadParams({ specType: "draft-mtp" }, "qairt", "npu");
    expect(qairt).not.toHaveProperty("specType");
  });
});

describe("chatSettingsFor", () => {
  it("keeps sampling settings and adds load parameters, without server settings", () => {
    // Rows saved before origins and keepalive moved to the app settings still carry them.
    const saved = {
      temperature: 0.5,
      think: false,
      grammarString: 'root ::= "yes"',
      nctx: 4096,
      ngl: -1,
      compute: "npu",
      origins: "*",
      keepalive: 300,
    };
    const settings = chatSettingsFor(saved, "llama_cpp", "npu");
    expect(settings).toEqual({
      temperature: 0.5,
      think: false,
      grammarString: 'root ::= "yes"',
      nctx: 4096,
      ngl: -1,
      compute: "npu",
    });
  });
});

describe("sameServerOptions", () => {
  const options = { origins: "*", keepalive: 300 };

  it("matches identical server settings and rejects any difference", () => {
    expect(sameServerOptions(options, { ...options })).toBe(true);
    expect(sameServerOptions(options, { ...options, keepalive: 60 })).toBe(false);
    expect(sameServerOptions(null, options)).toBe(false);
  });
});

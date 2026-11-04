import { describe, expect, it } from "vitest";
import type { AihubModelDetail } from "../services/aihub";
import type { DbDownloadedModel } from "../services/database";
import type { HubModel } from "../services/hubApi";
import type { CardRamVerdict } from "./cardRam";
import type { HubFacetSummary } from "./hubModelInfo";
import {
  aihubCompatibilityCells,
  aihubSpecCells,
  capabilityMeaning,
  fitCell,
  hubSpecCells,
  installedSpecCells,
  quantisationRangeOf,
  type SpecCell,
} from "./modelSpecs";

const FACETS: HubFacetSummary = {
  task: "text-generation",
  library: "gguf",
  license: "apache-2.0",
  paramCount: 596049920,
  paramCountApproximate: true,
  baseRelation: "quantized",
  baseRepo: "Qwen/Qwen3-0.6B",
  quantBits: [4, 8],
};

const MODEL: HubModel = {
  _id: "1",
  id: "unsloth/Qwen3-0.6B-GGUF",
  downloads: 154128,
  downloadsAllTime: 1333251,
  likes: 144,
  createdAt: "2025-04-28T10:24:13.000Z",
  lastModified: "2025-06-23T00:26:15.000Z",
  gguf: { architecture: "qwen3", context_length: 40960 },
  cardData: {
    language: ["en", "fr"],
    license: "apache-2.0",
    license_link: "https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE",
    base_model: "Qwen/Qwen3-0.6B",
  },
  childrenModelCount: { quantized: 12, adapter: 0, merge: 0, finetune: 0 },
};

function cell(cells: SpecCell[], label: string): SpecCell {
  const found = cells.find((c) => c.label === label);
  if (!found) throw new Error(`no cell ${label}`);
  return found;
}

describe("capabilityMeaning", () => {
  it("joins the meanings of the badges in order", () => {
    expect(
      capabilityMeaning([
        { id: "tools", label: "" },
        { id: "vision", label: "" },
      ]),
    ).toBe("Tools: calls functions · Vision: reads images");
  });

  it("is empty when there are no badges", () => {
    expect(capabilityMeaning([])).toBe("");
  });
});

describe("quantisationRangeOf", () => {
  it("is null without precisions", () => {
    expect(quantisationRangeOf([])).toBeNull();
  });

  it("gives one precision on its own", () => {
    expect(quantisationRangeOf(["q4_0"])).toEqual({ text: "q4_0", bits: "4.5–4.5 bit" });
  });

  it("gives the lowest and highest bits as a range, without duplicates", () => {
    expect(quantisationRangeOf(["Q8_0", "Q2_K", "Q4_K_M", "Q2_K"])).toEqual({
      text: "Q2_K to Q8_0",
      bits: "2–8 bit",
    });
  });

  it("leaves the bit span out when a precision has no known width", () => {
    expect(quantisationRangeOf(["custom", "Q8_0"])?.bits).toBeUndefined();
  });
});

describe("fitCell", () => {
  const verdict: CardRamVerdict = { level: "fits", label: "Fits at 4-bit", detail: "" };

  it("shows the verdict label", () => {
    expect(fitCell(verdict)).toEqual({ label: "Fits this PC", value: "Fits at 4-bit" });
  });

  it("marks an approximate size as an estimate", () => {
    expect(fitCell(verdict, true).value).toBe("Fits at 4-bit (estimate)");
  });

  it("has no value without a verdict", () => {
    expect(fitCell(null).value).toBeNull();
  });
});

describe("hubSpecCells", () => {
  it("lists the Hub facts with their labels", () => {
    const cells = hubSpecCells(MODEL, FACETS, ["Q8_0", "Q4_K_M"]);
    expect(cell(cells, "Architecture").value).toBe("qwen3");
    expect(cell(cells, "Context length").value).toBe("40,960 tokens");
    expect(cell(cells, "Quantisation range").value).toBe("Q4_K_M to Q8_0");
    expect(cell(cells, "Downloads, last 30 days").value).toBe("154,128");
    expect(cell(cells, "Downloads, all time").value).toBe("1,333,251");
    expect(cell(cells, "Likes").value).toBe("144");
    expect(cell(cells, "Languages").value).toBe("en, fr");
    expect(cell(cells, "Quantised versions").value).toBe("12");
    expect(cell(cells, "Created").value).toContain("2025");
    expect(cell(cells, "Updated").value).toContain("2025");
  });

  it("links the licence and a single base model", () => {
    const cells = hubSpecCells(MODEL, FACETS, []);
    expect(cell(cells, "Licence")).toMatchObject({
      value: "apache-2.0",
      href: "https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE",
    });
    expect(cell(cells, "Base model")).toMatchObject({
      value: "Qwen/Qwen3-0.6B",
      href: "https://huggingface.co/Qwen/Qwen3-0.6B",
    });
  });

  it("marks a list of base models as text without a link", () => {
    const cells = hubSpecCells(
      { ...MODEL, cardData: { base_model: ["A/one", "B/two"] } },
      FACETS,
      [],
    );
    expect(cell(cells, "Base model")).toMatchObject({ value: "A/one, B/two", href: null });
  });

  it("uses the base from the tags when the card has none", () => {
    const cells = hubSpecCells({ ...MODEL, cardData: undefined }, FACETS, []);
    expect(cell(cells, "Base model").value).toBe("Qwen/Qwen3-0.6B");
  });

  it("leaves out the facts the Hub did not send", () => {
    const cells = hubSpecCells({ _id: "1", id: "x/y" }, { ...FACETS, paramCount: null }, []);
    expect(cell(cells, "Architecture").value).toBeNull();
    expect(cell(cells, "Context length").value).toBeNull();
    expect(cell(cells, "Parameters").value).toBeNull();
    expect(cell(cells, "Quantisation range").value).toBeNull();
    expect(cell(cells, "Downloads, all time").value).toBeNull();
    expect(cell(cells, "Languages").value).toBeNull();
  });

  it("shows a zero count", () => {
    const cells = hubSpecCells({ ...MODEL, likes: 0 }, FACETS, []);
    expect(cell(cells, "Likes").value).toBe("0");
  });
});

describe("installedSpecCells", () => {
  const row: DbDownloadedModel = {
    name: "org/model",
    precision: "Q4_K_M",
    context_size: 8192,
    param_count: 596049920,
    repo_url: null,
    model_card: null,
    facets: null,
    base_ram_bytes: 400 * 1024 * 1024,
    context_ram_bytes: 100 * 1024 * 1024,
    ram_approximate: false,
  };

  it("reads the stored precision, window, size and RAM", () => {
    const cells = installedSpecCells(row, FACETS);
    expect(cell(cells, "Precision").value).toBe("Q4_K_M");
    expect(cell(cells, "Context window").value).toBe("8,192 tokens");
    expect(cell(cells, "Parameters").value).toBe("~596M");
    expect(cell(cells, "RAM needed").value).toBe("~500.0 MB");
  });

  it("marks an approximate RAM figure", () => {
    const cells = installedSpecCells({ ...row, ram_approximate: true }, FACETS);
    expect(cell(cells, "RAM needed").value).toBe("about 500.0 MB");
  });

  it("falls back to the row's parameter count without facets", () => {
    const cells = installedSpecCells(row, null);
    expect(cell(cells, "Parameters").value).toBe("596M");
  });

  it("leaves out what the row does not keep", () => {
    const cells = installedSpecCells(
      { ...row, precision: null, context_size: null, param_count: null, base_ram_bytes: null },
      null,
    );
    expect(cell(cells, "Precision").value).toBeNull();
    expect(cell(cells, "Context window").value).toBeNull();
    expect(cell(cells, "Parameters").value).toBeNull();
    expect(cell(cells, "RAM needed").value).toBeNull();
  });

  it("has no cells when the row is missing", () => {
    const cells = installedSpecCells(null, null);
    expect(cells.every((c) => !c.value)).toBe(true);
  });
});

describe("aihub cells", () => {
  const detail: AihubModelDetail = {
    id: "qwen3_0_6b",
    name: "Qwen3",
    headline: "",
    description: "",
    domain: "GENERATIVE_AI",
    useCase: "TEXT_GENERATION",
    licenseType: "",
    licenseUrl: null,
    sourceRepo: null,
    restrictModelSharing: false,
    callToAction: null,
    tags: [],
    technicalDetails: [
      { key: "Model Size", value: "429 MB" },
      { key: "Context lengths", value: "512, 4096" },
    ],
    researchPaper: null,
    researchPaperTitle: null,
    applicableScenarios: [],
    genieCompatible: true,
    geniexLlamacppCompatible: null,
    assets: null,
  };

  it("shows the runtime flags as Yes or No, and leaves out unknown ones", () => {
    const cells = aihubCompatibilityCells(detail);
    expect(cell(cells, "QAIRT runtime").value).toBe("Yes");
    expect(cells.find((c) => c.label === "llama.cpp runtime")?.value).toBeNull();
    expect(
      cell(aihubCompatibilityCells({ ...detail, genieCompatible: false }), "QAIRT runtime").value,
    ).toBe("No");
  });

  it("lists the domain, the use case and each technical detail under its own label", () => {
    const cells = aihubSpecCells(detail);
    expect(cell(cells, "Domain").value).toBe("Generative ai");
    expect(cell(cells, "Use case").value).toBe("Text generation");
    expect(cell(cells, "Model Size").value).toBe("429 MB");
    expect(cell(cells, "Context lengths").value).toBe("512, 4096");
  });

  it("leaves out a domain or use case that is empty", () => {
    const cells = aihubSpecCells({ ...detail, useCase: "" });
    expect(cell(cells, "Use case").value).toBeNull();
  });
});

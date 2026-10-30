import { describe, expect, it } from "vitest";
import type { ComputeTarget, ModelInfo, ServerStatus } from "../types";
import type { LoadedServer, LoadedServers } from "./loadedServers";
import type { RamSnapshot } from "./modelRam";
import {
  extraLoadedLabel,
  occupantOf,
  type ResolvedComputes,
  replacedRamBytes,
  replacementText,
  rowStatusText,
  type SelectorRow,
  selectorGroups,
} from "./modelSelector";

const GB = 1_073_741_824;

function model(name: string): ModelInfo {
  return { name, size: "2.0 GB", source: "hf", precisions: ["W4A16"] };
}

function server(compute: ComputeTarget, model: string, device: string | null = null): LoadedServer {
  const status: ServerStatus = { running: true, port: 18000, models: [model] };
  return { compute, port: 18000, model, nctx: 4096, device, status };
}

function row(overrides: Partial<SelectorRow> = {}): SelectorRow {
  return {
    model: model("org/a"),
    compute: null,
    device: null,
    loaded: false,
    active: false,
    ...overrides,
  };
}

const CHAT = model("org/chat-2B");
const VISION = model("org/vision-4B");
const OTHER = model("org/other-1B");

describe("selectorGroups", () => {
  it("puts models held by a compute in the loaded group and the rest in ready", () => {
    const loaded: LoadedServers = { npu: server("npu", "chat-2B") };
    const groups = selectorGroups([CHAT, VISION, OTHER], loaded, "chat-2B", {});
    expect(groups.loaded.map((r) => r.model.name)).toEqual([CHAT.name]);
    expect(groups.ready.map((r) => r.model.name)).toEqual([VISION.name, OTHER.name]);
  });

  it("lists the active model first, then the rest in compute order", () => {
    const loaded: LoadedServers = {
      npu: server("npu", "chat-2B"),
      cpu: server("cpu", "vision-4B"),
      gpu: server("gpu", "other-1B"),
    };
    const groups = selectorGroups([OTHER, VISION, CHAT], loaded, "chat-2B", {});
    expect(groups.loaded.map((r) => r.compute)).toEqual(["npu", "cpu", "gpu"]);
    expect(groups.loaded[0]?.active).toBe(true);
  });

  it("orders the non-active loaded models by compute, CPU before GPU before NPU", () => {
    const loaded: LoadedServers = {
      npu: server("npu", "chat-2B"),
      cpu: server("cpu", "vision-4B"),
    };
    const groups = selectorGroups([CHAT, VISION], loaded, null, {});
    expect(groups.loaded.map((r) => r.compute)).toEqual(["cpu", "npu"]);
  });

  it("matches the active model and loaded models by base name", () => {
    const loaded: LoadedServers = { npu: server("npu", "org/chat-2B:Q4_K_M") };
    const groups = selectorGroups([CHAT], loaded, "chat-2B", {});
    expect(groups.loaded[0]).toMatchObject({ compute: "npu", active: true, loaded: true });
  });

  it("treats the active model as loaded even when no compute holds it", () => {
    const groups = selectorGroups([CHAT], {}, "chat-2B", {});
    expect(groups.loaded[0]).toMatchObject({ compute: null, active: true, loaded: true });
    expect(groups.ready).toEqual([]);
  });

  it("takes the device from the loaded server", () => {
    const loaded: LoadedServers = { npu: server("npu", "chat-2B", "HTP") };
    const groups = selectorGroups([CHAT], loaded, "chat-2B", {});
    expect(groups.loaded[0]?.device).toBe("HTP");
  });

  it("gives a ready model the compute it would load on, when resolved", () => {
    const resolved: ResolvedComputes = { [VISION.name]: "cpu" };
    const groups = selectorGroups([VISION, OTHER], {}, null, resolved);
    expect(groups.ready.map((r) => r.compute)).toEqual(["cpu", null]);
    expect(groups.ready.every((r) => r.device === null && !r.loaded)).toBe(true);
  });

  it("keeps the order of the models in the ready group", () => {
    const groups = selectorGroups([OTHER, VISION, CHAT], {}, null, {});
    expect(groups.ready.map((r) => r.model.name)).toEqual([OTHER.name, VISION.name, CHAT.name]);
  });
});

describe("rowStatusText", () => {
  it("says Active with the compute for the active model", () => {
    expect(rowStatusText(row({ active: true, loaded: true, compute: "npu" }))).toBe("Active · NPU");
  });

  it("says Active alone when the active model has no known compute", () => {
    expect(rowStatusText(row({ active: true, loaded: true }))).toBe("Active");
  });

  it("says Loaded on the compute for a loaded model that is not active", () => {
    expect(rowStatusText(row({ loaded: true, compute: "cpu" }))).toBe("Loaded on CPU");
  });

  it("says Loaded alone when the server does not say where", () => {
    expect(rowStatusText(row({ loaded: true }))).toBe("Loaded");
  });

  it("says Runs on the compute a ready model would use", () => {
    expect(rowStatusText(row({ compute: "gpu" }))).toBe("Runs on GPU");
  });

  it("has no text for a ready model whose compute is not known yet", () => {
    expect(rowStatusText(row())).toBeNull();
  });
});

describe("extraLoadedLabel", () => {
  it("is null with one or no loaded model", () => {
    expect(extraLoadedLabel(0)).toBeNull();
    expect(extraLoadedLabel(1)).toBeNull();
  });

  it("counts the loaded models besides the active one", () => {
    expect(extraLoadedLabel(2)).toBe("+1 loaded");
    expect(extraLoadedLabel(3)).toBe("+2 loaded");
  });
});

describe("occupantOf", () => {
  it("returns the server holding the compute", () => {
    const loaded: LoadedServers = { npu: server("npu", "chat-2B") };
    expect(occupantOf(loaded, "npu")?.model).toBe("chat-2B");
  });

  it("is null for an empty or unknown compute", () => {
    expect(occupantOf({}, "npu")).toBeNull();
    expect(occupantOf({}, null)).toBeNull();
  });
});

describe("replacementText", () => {
  it("names the model that holds the compute and the one being loaded", () => {
    const occupant = server("npu", "org/chat-2B:Q4_K_M");
    expect(replacementText("org/vision-4B", occupant)).toBe(
      "NPU runs chat-2B. Loading vision-4B on NPU unloads it.",
    );
  });

  it("falls back to a generic sentence when nothing holds the compute", () => {
    expect(replacementText("org/vision-4B", null)).toBe(
      "Loading vision-4B unloads the model on its compute.",
    );
  });
});

describe("replacedRamBytes", () => {
  // 16 GB total; the models' estimates are 4 GB (chat) and 2 GB (vision).
  const snapshot: RamSnapshot = {
    memory: { totalBytes: 16 * GB, availableBytes: 6 * GB },
    headroomPercent: 10,
    rowsByModel: {
      [CHAT.name]: [
        {
          name: CHAT.name,
          precision: "W4A16",
          weightsBytes: 4 * GB,
          kvBytes: 0,
          extraBytes: 0,
          totalBytes: 4 * GB,
          approximate: false,
        },
      ],
      [VISION.name]: [
        {
          name: VISION.name,
          precision: "W4A16",
          weightsBytes: 2 * GB,
          kvBytes: 0,
          extraBytes: 0,
          totalBytes: 2 * GB,
          approximate: false,
        },
      ],
    },
  };
  const models = [CHAT, VISION];

  it("is the estimate of the model on the compute", () => {
    const loaded: LoadedServers = { npu: server("npu", "org/chat-2B") };
    expect(replacedRamBytes(snapshot, models, loaded, "npu")).toBe(4 * GB);
  });

  it("is zero when the compute is empty, unknown or the figures are missing", () => {
    const loaded: LoadedServers = { npu: server("npu", "org/chat-2B") };
    expect(replacedRamBytes(snapshot, models, loaded, "cpu")).toBe(0);
    expect(replacedRamBytes(snapshot, models, loaded, null)).toBe(0);
    expect(replacedRamBytes(null, models, loaded, "npu")).toBe(0);
  });

  it("is zero when the occupant is not an installed model", () => {
    const loaded: LoadedServers = { npu: server("npu", "org/deleted-7B") };
    expect(replacedRamBytes(snapshot, models, loaded, "npu")).toBe(0);
  });
});

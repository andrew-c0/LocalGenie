import { describe, expect, it } from "vitest";
import type { ComputeTarget, ServerStatus } from "../types";
import {
  activeComputeUpdate,
  activeFields,
  computeForLoad,
  computeHoldingModel,
  deviceForModel,
  keepOrFirst,
  type LoadedServer,
  type LoadedServers,
  loadedComputes,
  loadedEntryOnPort,
  loadedServerFrom,
  loadedServerUpdate,
  pickActiveCompute,
  type ServerState,
  serverPortUpdate,
  serverStatusUpdate,
  stoppedStatus,
  withLoadedServer,
} from "./loadedServers";

const MAIN = 18181;

function status(port: number, models: string[] = [], running = true): ServerStatus {
  return { running, port, models };
}

function server(
  compute: ComputeTarget,
  port: number,
  model: string,
  extra: Partial<LoadedServer> = {},
): LoadedServer {
  return {
    compute,
    port,
    model,
    nctx: 4096,
    device: null,
    status: status(port, [model]),
    ...extra,
  };
}

function stateWith(
  loadedServers: LoadedServers,
  activeCompute: ComputeTarget | null,
  overrides: Partial<ServerState> = {},
): ServerState {
  const active = activeCompute === null ? undefined : loadedServers[activeCompute];
  return {
    mainServerPort: MAIN,
    serverPort: active ? active.port : MAIN,
    serverStatus: active ? active.status : stoppedStatus(MAIN),
    loadedServers,
    activeCompute,
    activeModelId: active ? active.model : null,
    loadedCompute: active ? active.compute : null,
    loadedContext: active ? active.nctx : null,
    ...overrides,
  };
}

const npu = server("npu", 20001, "Qwen3.5-2B");
const gpu = server("gpu", 20002, "gemma-4-E4B-it-GGUF");

describe("pickActiveCompute and loadedComputes", () => {
  it("lists loaded computes in display order (cpu, gpu, npu)", () => {
    expect(loadedComputes({ npu, cpu: server("cpu", 20003, "x") })).toEqual(["cpu", "npu"]);
  });

  it("picks the first loaded compute, or null when none is loaded", () => {
    expect(pickActiveCompute({ npu, gpu })).toBe("gpu");
    expect(pickActiveCompute({})).toBeNull();
  });
});

describe("computeHoldingModel", () => {
  it("finds the compute holding the model, ignoring any precision suffix", () => {
    const loaded = { npu: server("npu", 20001, "unsloth/gemma-4-E4B-it-GGUF:Q4_K_M") };
    expect(computeHoldingModel(loaded, "unsloth/gemma-4-E4B-it-GGUF")).toBe("npu");
    expect(computeHoldingModel(loaded, "other/gemma-4-E4B-it-GGUF:Q8_0")).toBe("npu");
  });

  it("is null when no loaded model matches", () => {
    expect(computeHoldingModel({ npu }, "gemma-4-E4B-it-GGUF")).toBeNull();
  });
});

describe("computeForLoad", () => {
  it("uses the compute the load parameters name", () => {
    expect(computeForLoad({ compute: "gpu" }, "npu")).toBe("gpu");
  });

  it("falls back to the default when the parameters name none (or an unknown one)", () => {
    expect(computeForLoad({}, "npu")).toBe("npu");
    expect(computeForLoad({ compute: "tpu" }, "cpu")).toBe("cpu");
  });
});

describe("withLoadedServer", () => {
  it("sets and removes one compute without touching the others", () => {
    const set = withLoadedServer({ npu }, "gpu", gpu);
    expect(set).toEqual({ npu, gpu });
    expect(withLoadedServer(set, "npu", null)).toEqual({ gpu });
  });

  it("does not change the input", () => {
    const input: LoadedServers = { npu };
    withLoadedServer(input, "npu", null);
    expect(input).toEqual({ npu });
  });
});

describe("activeFields", () => {
  it("follows the active server", () => {
    expect(activeFields({ npu, gpu }, "npu", MAIN)).toEqual({
      activeCompute: "npu",
      serverPort: 20001,
      serverStatus: npu.status,
      activeModelId: "Qwen3.5-2B",
      loadedCompute: "npu",
      loadedContext: 4096,
    });
  });

  it("falls back to the main port with nothing loaded when no server is active", () => {
    expect(activeFields({ npu }, null, MAIN)).toEqual({
      activeCompute: null,
      serverPort: MAIN,
      serverStatus: stoppedStatus(MAIN),
      activeModelId: null,
      loadedCompute: null,
      loadedContext: null,
    });
  });
});

describe("serverPortUpdate", () => {
  it("sets the main port and the active port when no server is loaded", () => {
    const update = serverPortUpdate(stateWith({}, null), 19000);
    expect(update.mainServerPort).toBe(19000);
    expect(update.serverPort).toBe(19000);
    expect(update.serverStatus).toEqual(stoppedStatus(19000));
  });

  it("sets only the main port while a server is active", () => {
    expect(serverPortUpdate(stateWith({ npu }, "npu"), 19000)).toEqual({ mainServerPort: 19000 });
  });
});

describe("loadedServerUpdate", () => {
  it("adds a server without activating it", () => {
    const update = loadedServerUpdate(stateWith({}, null), "npu", npu);
    expect(update).toEqual({ loadedServers: { npu } });
  });

  it("makes the active server's fields follow an updated entry for the active compute", () => {
    const updated = { ...npu, model: "other" };
    const update = loadedServerUpdate(stateWith({ npu }, "npu"), "npu", updated);
    expect(update.activeModelId).toBe("other");
  });

  it("switches to another loaded compute when the active server is removed", () => {
    const update = loadedServerUpdate(stateWith({ npu, gpu }, "npu"), "npu", null);
    expect(update.activeCompute).toBe("gpu");
    expect(update.serverPort).toBe(20002);
    expect(update.loadedServers).toEqual({ gpu });
  });

  it("clears the active fields when the last loaded server is removed", () => {
    const update = loadedServerUpdate(stateWith({ npu }, "npu"), "npu", null);
    expect(update).toEqual({
      loadedServers: {},
      ...activeFields({}, null, MAIN),
    });
  });

  it("leaves the active server alone when another compute's server is removed", () => {
    const update = loadedServerUpdate(stateWith({ npu, gpu }, "npu"), "gpu", null);
    expect(update).toEqual({ loadedServers: { npu } });
  });
});

describe("activeComputeUpdate", () => {
  it("makes a loaded compute active, with its fields", () => {
    const update = activeComputeUpdate(stateWith({ npu, gpu }, "npu"), "gpu");
    expect(update.activeCompute).toBe("gpu");
    expect(update.activeModelId).toBe("gemma-4-E4B-it-GGUF");
    expect(update.serverPort).toBe(20002);
  });

  it("ignores a compute with no loaded server", () => {
    expect(activeComputeUpdate(stateWith({ npu }, "npu"), "cpu")).toEqual({});
  });

  it("clears the active compute when given null", () => {
    const update = activeComputeUpdate(stateWith({ npu }, "npu"), null);
    expect(update.activeCompute).toBeNull();
    expect(update.serverPort).toBe(MAIN);
    expect(update.activeModelId).toBeNull();
  });
});

describe("serverStatusUpdate", () => {
  it("updates a loaded server's entry and keeps its model while it is still listed", () => {
    const update = serverStatusUpdate(
      stateWith({ npu }, "npu"),
      status(20001, ["Qwen3.5-2B", "extra"]),
    );
    expect(update.loadedServers?.npu?.model).toBe("Qwen3.5-2B");
    expect(update.loadedServers?.npu?.status.models).toEqual(["Qwen3.5-2B", "extra"]);
    expect(update.serverStatus?.models).toEqual(["Qwen3.5-2B", "extra"]);
  });

  it("removes a loaded server whose status says it stopped", () => {
    const update = serverStatusUpdate(stateWith({ npu, gpu }, "npu"), status(20001, [], false));
    expect(update.loadedServers).toEqual({ gpu });
    expect(update.activeCompute).toBe("gpu");
  });

  it("removes a loaded server that lists no model", () => {
    const update = serverStatusUpdate(stateWith({ npu }, "npu"), status(20001, []));
    expect(update.loadedServers).toEqual({});
    expect(update.activeCompute).toBeNull();
  });

  it("applies a status for the active port that no entry covers (no server loaded)", () => {
    const update = serverStatusUpdate(stateWith({}, null), status(MAIN, ["m"]));
    expect(update.serverStatus).toEqual(status(MAIN, ["m"]));
    expect(update.activeModelId).toBe("m");
  });

  it("ignores a status for a port that is neither loaded nor the active one", () => {
    expect(serverStatusUpdate(stateWith({ npu }, "npu"), status(MAIN, ["m"]))).toEqual({});
  });

  it("clears loaded fields when an uncovered status lists nothing", () => {
    const update = serverStatusUpdate(stateWith({}, null, { loadedCompute: "cpu" }), status(MAIN));
    expect(update.activeModelId).toBeNull();
    expect(update.loadedCompute).toBeNull();
    expect(update.loadedContext).toBeNull();
  });
});

describe("loadedEntryOnPort", () => {
  it("returns the compute and server listening on the port", () => {
    expect(loadedEntryOnPort({ npu, gpu }, 20002)).toEqual(["gpu", gpu]);
  });

  it("is null for a port no loaded server uses", () => {
    expect(loadedEntryOnPort({ npu }, MAIN)).toBeNull();
  });
});

describe("keepOrFirst", () => {
  it("keeps the current model while it is listed", () => {
    expect(keepOrFirst("b", ["a", "b"])).toBe("b");
  });

  it("falls back to the first listed model, or null when none is listed", () => {
    expect(keepOrFirst("c", ["a", "b"])).toBe("a");
    expect(keepOrFirst(null, [])).toBeNull();
  });
});

describe("deviceForModel and loadedServerFrom", () => {
  it("reads the device for the model by base name", () => {
    const devices = [{ id: "org/model:Q4_K_M", device: "HTP0" }];
    expect(deviceForModel(devices, "org/model")).toBe("HTP0");
    expect(deviceForModel(devices, "org/other")).toBeNull();
    expect(deviceForModel(undefined, "org/model")).toBeNull();
  });

  it("builds an entry with the device from the status", () => {
    const entry = loadedServerFrom({
      compute: "npu",
      port: 20001,
      model: "org/model",
      nctx: 2048,
      status: {
        running: true,
        port: 20001,
        models: ["org/model"],
        devices: [{ id: "org/model", device: "HTP0" }],
      },
    });
    expect(entry).toMatchObject({
      compute: "npu",
      port: 20001,
      model: "org/model",
      nctx: 2048,
      device: "HTP0",
    });
  });
});

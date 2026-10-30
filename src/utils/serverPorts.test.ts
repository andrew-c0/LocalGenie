import { describe, expect, it } from "vitest";
import type { ComputeTarget } from "../types";
import {
  addPortInUseErrors,
  type ComputePortDrafts,
  type ComputePorts,
  computeOfServer,
  computeUsingPort,
  draftsToPorts,
  isValidPort,
  MAIN_PORT_KEY,
  PORT_FREE,
  type PortUse,
  parsePortDraft,
  portInUseMessage,
  portSettingWrites,
  portsToDrafts,
  portsToProbe,
  portToProbe,
  portUseMessage,
  portUseOf,
  stopAffectsMainServer,
  validateComputePorts,
} from "./serverPorts";

const blank: ComputePortDrafts = { cpu: "", gpu: "", npu: "" };
const noPorts: ComputePorts = { cpu: null, gpu: null, npu: null };
const noUses: Record<ComputeTarget, PortUse> = { cpu: PORT_FREE, gpu: PORT_FREE, npu: PORT_FREE };

describe("isValidPort", () => {
  it("accepts the ends of the range and the default port", () => {
    expect(isValidPort(1024)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
    expect(isValidPort(18181)).toBe(true);
  });

  it("rejects ports outside the range", () => {
    expect(isValidPort(1023)).toBe(false);
    expect(isValidPort(65536)).toBe(false);
    expect(isValidPort(0)).toBe(false);
  });

  it("rejects values that are not whole numbers", () => {
    expect(isValidPort(5000.5)).toBe(false);
    expect(isValidPort(Number.NaN)).toBe(false);
  });
});

describe("parsePortDraft", () => {
  it("reads blank text as no port", () => {
    expect(parsePortDraft("")).toBeNull();
    expect(parsePortDraft("   ")).toBeNull();
  });

  it("reads a number, ignoring surrounding spaces", () => {
    expect(parsePortDraft("5000")).toBe(5000);
    expect(parsePortDraft(" 5000 ")).toBe(5000);
  });

  it("returns an invalid number for text, which validation then rejects", () => {
    expect(isValidPort(parsePortDraft("abc") as number)).toBe(false);
  });
});

describe("portsToDrafts and draftsToPorts", () => {
  it("round-trips set and unset ports", () => {
    const ports = { cpu: 5000, gpu: null, npu: 5002 };
    expect(draftsToPorts(portsToDrafts(ports))).toEqual(ports);
  });

  it("shows an unset port as a blank field", () => {
    expect(portsToDrafts({ cpu: null, gpu: null, npu: null })).toEqual(blank);
  });
});

describe("validateComputePorts", () => {
  it("accepts all blank fields, which mean random ports", () => {
    expect(validateComputePorts(blank, 18181)).toEqual({});
  });

  it("accepts distinct valid ports that differ from the main port", () => {
    expect(validateComputePorts({ cpu: "5000", gpu: "5001", npu: "5002" }, 18181)).toEqual({});
  });

  it("accepts a mix of set and blank fields", () => {
    expect(validateComputePorts({ cpu: "", gpu: "5001", npu: "" }, 18181)).toEqual({});
  });

  it("flags a port out of range, and leaves the other fields alone", () => {
    expect(validateComputePorts({ cpu: "80", gpu: "", npu: "" }, 18181)).toEqual({
      cpu: "Port must be 1024–65535",
    });
  });

  it("flags text and fractions as out of range", () => {
    const errors = validateComputePorts({ cpu: "abc", gpu: "5000.5", npu: "" }, 18181);
    expect(errors).toEqual({
      cpu: "Port must be 1024–65535",
      gpu: "Port must be 1024–65535",
    });
  });

  it("flags a port equal to the main server port", () => {
    expect(validateComputePorts({ cpu: "18181", gpu: "", npu: "" }, 18181)).toEqual({
      cpu: "Same as the main server port",
    });
  });

  it("does not compare against the main port when it is not valid", () => {
    expect(validateComputePorts({ cpu: "18181", gpu: "", npu: "" }, null)).toEqual({});
  });

  it("flags a duplicate on both computes that share a port", () => {
    expect(validateComputePorts({ cpu: "5000", gpu: "5000", npu: "" }, 18181)).toEqual({
      cpu: "Same port as the GPU server",
      gpu: "Same port as the CPU server",
    });
  });

  it("flags every compute in a three-way clash", () => {
    const errors = validateComputePorts({ cpu: "5000", gpu: "5000", npu: "5000" }, 18181);
    expect(Object.keys(errors).sort()).toEqual(["cpu", "gpu", "npu"]);
  });

  it("does not treat blank fields as duplicates of each other", () => {
    expect(validateComputePorts({ cpu: "", gpu: "", npu: "5000" }, 18181)).toEqual({});
  });
});

describe("computeUsingPort", () => {
  it("returns the compute that holds the port", () => {
    expect(computeUsingPort({ cpu: "5000", gpu: "", npu: "5002" }, 5002)).toBe("npu");
  });

  it("returns null when no compute holds the port, or the port is unknown", () => {
    expect(computeUsingPort({ cpu: "5000", gpu: "", npu: "" }, 18181)).toBeNull();
    expect(computeUsingPort({ cpu: "5000", gpu: "", npu: "" }, null)).toBeNull();
  });
});

describe("portToProbe", () => {
  it("checks a valid port that differs from the saved one", () => {
    expect(portToProbe(5001, 5000, undefined)).toBe(5001);
    expect(portToProbe(5001, null, undefined)).toBe(5001);
  });

  it("skips a port that is unchanged, since the server already uses it", () => {
    expect(portToProbe(5000, 5000, undefined)).toBeNull();
  });

  it("skips an empty or invalid port, and a port with a validation error", () => {
    expect(portToProbe(null, 5000, undefined)).toBeNull();
    expect(portToProbe(5001, 5000, "Same port as the GPU server")).toBeNull();
  });
});

describe("portsToProbe", () => {
  it("checks only the computes whose port changed and passed validation", () => {
    const probe = portsToProbe(
      { cpu: 5001, gpu: 5000, npu: 5002 },
      { cpu: 5000, gpu: 5000, npu: null },
      { npu: "Same as the main server port" },
    );
    expect(probe).toEqual({ cpu: 5001, gpu: null, npu: null });
  });
});

describe("addPortInUseErrors", () => {
  it("adds the in-use message to a compute whose port another process holds", () => {
    const errors = addPortInUseErrors(
      {},
      { cpu: 5001, gpu: null, npu: null },
      { ...noUses, cpu: { kind: "other-process" } },
    );
    expect(errors).toEqual({ cpu: portInUseMessage(5001) });
  });

  it("adds the other-server message to a compute whose port is another compute's server", () => {
    const errors = addPortInUseErrors(
      {},
      { cpu: null, gpu: 5001, npu: null },
      { ...noUses, gpu: { kind: "other-server", compute: "npu" } },
    );
    expect(errors).toEqual({ gpu: "Port 5001 is already used by the NPU server" });
  });

  it("keeps the existing error when a field has one", () => {
    const errors = addPortInUseErrors(
      { cpu: "Same port as the GPU server" },
      { cpu: 5001, gpu: 5001, npu: null },
      { ...noUses, cpu: { kind: "other-process" } },
    );
    expect(errors).toEqual({ cpu: "Same port as the GPU server" });
  });

  it("returns the errors unchanged when every port is free", () => {
    expect(addPortInUseErrors({}, { cpu: 5001, gpu: null, npu: null }, noUses)).toEqual({});
  });
});

describe("computeOfServer", () => {
  it("returns the compute of a known server", () => {
    expect(computeOfServer("gpu")).toBe("gpu");
  });

  it("returns null for an unknown, missing or unexpected compute", () => {
    expect(computeOfServer(null)).toBeNull();
    expect(computeOfServer(undefined)).toBeNull();
    expect(computeOfServer("GPU")).toBeNull();
    expect(computeOfServer("tpu")).toBeNull();
  });
});

describe("portUseOf", () => {
  const cpuServer = { running: true, port: 5000, models: [], compute: "cpu" };
  const npuServer = { running: true, port: 5002, models: [], compute: "npu" };

  it("is free when our server for the same compute runs on the port", () => {
    expect(portUseOf(5000, "cpu", [cpuServer], true)).toEqual(PORT_FREE);
  });

  it("is a conflict when our server for another compute runs on the port", () => {
    expect(portUseOf(5002, "cpu", [npuServer], true)).toEqual({
      kind: "other-server",
      compute: "npu",
    });
  });

  it("is a conflict with another process when something answers and no server of ours holds it", () => {
    expect(portUseOf(5001, "cpu", [cpuServer, npuServer], true)).toEqual({
      kind: "other-process",
    });
  });

  it("is free when nothing answers and no server of ours holds the port", () => {
    expect(portUseOf(5001, "cpu", [cpuServer], false)).toEqual(PORT_FREE);
  });

  it("ignores a stopped server of ours, so its port is judged by whether it answers", () => {
    const stopped = { ...cpuServer, running: false };
    expect(portUseOf(5000, "cpu", [stopped], true)).toEqual({ kind: "other-process" });
    expect(portUseOf(5000, "cpu", [stopped], false)).toEqual(PORT_FREE);
  });

  it("falls back to whether the port answers when our server's compute is unknown", () => {
    const unknown = { ...cpuServer, compute: null };
    expect(portUseOf(5000, "gpu", [unknown], true)).toEqual({ kind: "other-process" });
    expect(portUseOf(5000, "gpu", [unknown], false)).toEqual(PORT_FREE);
  });

  it("treats a server of ours as another compute's when checking the main port", () => {
    expect(portUseOf(5000, null, [cpuServer], true)).toEqual({
      kind: "other-server",
      compute: "cpu",
    });
  });
});

describe("portUseMessage", () => {
  it("is undefined for a free port", () => {
    expect(portUseMessage(5000, PORT_FREE)).toBeUndefined();
  });

  it("names the other process for a port another program answers on", () => {
    expect(portUseMessage(5000, { kind: "other-process" })).toBe(portInUseMessage(5000));
  });

  it("names the compute whose server holds the port", () => {
    expect(portUseMessage(5000, { kind: "other-server", compute: "npu" })).toBe(
      "Port 5000 is already used by the NPU server",
    );
  });
});

describe("stopAffectsMainServer", () => {
  it("counts a stop of the main port", () => {
    expect(stopAffectsMainServer({ port: 18181 }, 18181)).toBe(true);
  });

  it("ignores a stop of another port", () => {
    expect(stopAffectsMainServer({ port: 5000 }, 18181)).toBe(false);
  });

  it("treats a null or missing payload as the main server", () => {
    expect(stopAffectsMainServer(null, 18181)).toBe(true);
    expect(stopAffectsMainServer(undefined, 18181)).toBe(true);
  });
});

describe("portInUseMessage", () => {
  it("names the port", () => {
    expect(portInUseMessage(18181)).toBe("Port 18181 is already in use by another process");
  });
});

describe("portSettingWrites", () => {
  it("lists the main port first, then each compute, with the values to restore", () => {
    const writes = portSettingWrites(
      { previous: 18181, next: 18200 },
      { previous: noPorts, next: { cpu: 5000, gpu: null, npu: null } },
    );
    expect(writes).toEqual([
      { key: MAIN_PORT_KEY, label: "server port", previous: 18181, next: 18200 },
      { key: "server_port_cpu", label: "CPU port", previous: null, next: 5000 },
    ]);
  });

  it("leaves out settings whose value does not change", () => {
    const writes = portSettingWrites(
      { previous: 18181, next: 18181 },
      { previous: { cpu: 5000, gpu: null, npu: null }, next: { cpu: 5000, gpu: 5001, npu: null } },
    );
    expect(writes.map((write) => write.key)).toEqual(["server_port_gpu"]);
  });
});

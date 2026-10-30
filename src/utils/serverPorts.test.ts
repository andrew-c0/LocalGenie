import { describe, expect, it } from "vitest";
import {
  addPortInUseErrors,
  type ComputePortDrafts,
  type ComputePorts,
  computeUsingPort,
  draftsToPorts,
  isValidPort,
  MAIN_PORT_KEY,
  parsePortDraft,
  portInUseMessage,
  portSettingWrites,
  portsToDrafts,
  portsToProbe,
  portToProbe,
  validateComputePorts,
} from "./serverPorts";

const blank: ComputePortDrafts = { cpu: "", gpu: "", npu: "" };
const noPorts: ComputePorts = { cpu: null, gpu: null, npu: null };
const noServing = { cpu: false, gpu: false, npu: false };

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
  it("adds the in-use message to a compute whose port answered", () => {
    const errors = addPortInUseErrors(
      {},
      { cpu: 5001, gpu: null, npu: null },
      {
        ...noServing,
        cpu: true,
      },
    );
    expect(errors).toEqual({ cpu: portInUseMessage(5001) });
  });

  it("keeps the existing error when a field has one", () => {
    const errors = addPortInUseErrors(
      { cpu: "Same port as the GPU server" },
      { cpu: 5001, gpu: 5001, npu: null },
      { ...noServing, cpu: true },
    );
    expect(errors).toEqual({ cpu: "Same port as the GPU server" });
  });

  it("returns the errors unchanged when nothing answers", () => {
    expect(addPortInUseErrors({}, { cpu: 5001, gpu: null, npu: null }, noServing)).toEqual({});
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

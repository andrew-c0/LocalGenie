import { describe, expect, it, vi } from "vitest";
import { describeSaveFailure, type SettingWrite, writeAllOrRollBack } from "./writeAllOrRollBack";

const writes: SettingWrite[] = [
  { key: "server_port", label: "server port", previous: 18181, next: 18200 },
  { key: "server_port_cpu", label: "CPU port", previous: null, next: 5000 },
  { key: "server_port_gpu", label: "GPU port", previous: 5100, next: 5101 },
];

/** A store that records each write and fails the keys listed in `failing`. */
function fakeStore(initial: Record<string, number | null>, failing: string[] = []) {
  const values = { ...initial };
  const calls: Array<[string, number | null]> = [];
  const write = vi.fn(async (key: string, value: number | null) => {
    calls.push([key, value]);
    if (failing.includes(key)) throw new Error(`disk full writing ${key}`);
    values[key] = value;
  });
  return { values, calls, write };
}

describe("writeAllOrRollBack", () => {
  it("writes every setting in order and reports success", async () => {
    const store = fakeStore({ server_port: 18181, server_port_gpu: 5100 });
    const outcome = await writeAllOrRollBack(writes, store.write);

    expect(outcome).toEqual({ ok: true });
    expect(store.calls).toEqual([
      ["server_port", 18200],
      ["server_port_cpu", 5000],
      ["server_port_gpu", 5101],
    ]);
  });

  it("restores the settings already written, newest first, when a later write fails", async () => {
    const store = fakeStore({ server_port: 18181, server_port_gpu: 5100 }, ["server_port_cpu"]);
    const outcome = await writeAllOrRollBack(writes, store.write);

    expect(outcome).toEqual({
      ok: false,
      failed: "CPU port",
      reason: "disk full writing server_port_cpu",
      unrestored: [],
    });
    // Only the main port was written before the failure, so only it is restored.
    expect(store.calls.slice(1)).toEqual([
      ["server_port_cpu", 5000],
      ["server_port", 18181],
    ]);
    expect(store.values.server_port).toBe(18181);
  });

  it("does not roll back the setting whose write failed", async () => {
    const store = fakeStore({}, ["server_port"]);
    const outcome = await writeAllOrRollBack(writes, store.write);

    expect(outcome.ok).toBe(false);
    expect(store.calls).toEqual([["server_port", 18200]]);
  });

  it("restores an unset compute port as null", async () => {
    const store = fakeStore({ server_port: 18181 }, ["server_port_gpu"]);
    await writeAllOrRollBack(writes, store.write);

    expect(store.calls).toContainEqual(["server_port_cpu", null]);
    expect(store.values.server_port_cpu).toBeNull();
  });

  it("reports the settings that could not be restored and keeps going", async () => {
    const write = vi.fn(async (key: string, value: number | null) => {
      // The CPU write fails, and so does restoring the main port to its previous value.
      if (key === "server_port_cpu" && value !== null) throw new Error("cpu write failed");
      if (key === "server_port" && value === 18181) throw new Error("restore failed");
    });
    const outcome = await writeAllOrRollBack(writes, write);

    expect(outcome).toEqual({
      ok: false,
      failed: "CPU port",
      reason: "cpu write failed",
      unrestored: ["server port"],
    });
    expect(write).toHaveBeenCalledTimes(3);
  });

  it("reports an empty list as a success without writing", async () => {
    const store = fakeStore({});
    expect(await writeAllOrRollBack([], store.write)).toEqual({ ok: true });
    expect(store.write).not.toHaveBeenCalled();
  });
});

describe("describeSaveFailure", () => {
  it("says the earlier values were kept when everything was restored", () => {
    expect(
      describeSaveFailure({
        ok: false,
        failed: "GPU port",
        reason: "database locked",
        unrestored: [],
      }),
    ).toBe("database locked The earlier values were kept.");
  });

  it("names the settings that could not be restored", () => {
    expect(
      describeSaveFailure({
        ok: false,
        failed: "GPU port",
        reason: "database locked",
        unrestored: ["server port", "CPU port"],
      }),
    ).toBe("database locked Could not restore: server port, CPU port.");
  });
});

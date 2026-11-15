import { beforeEach, describe, expect, it, vi } from "vitest";

const getBackgroundSettings = vi.fn();
const setKeepRunningInTray = vi.fn();
const setStartWithWindows = vi.fn();
vi.mock("../services/background", () => ({
  getBackgroundSettings: () => getBackgroundSettings(),
  setKeepRunningInTray: (enabled: boolean) => setKeepRunningInTray(enabled),
  setStartWithWindows: (enabled: boolean) => setStartWithWindows(enabled),
}));

const toastError = vi.fn();
vi.mock("../utils/toast", () => ({
  toast: { error: (title: string, body?: string) => toastError(title, body) },
}));

import type { BackgroundSettings } from "../types";
import { useBackgroundStore } from "./backgroundStore";

const saved: BackgroundSettings = { keepRunningInTray: true, startWithWindows: false };

const deferred = () => {
  let resolve: () => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("backgroundStore", () => {
  beforeEach(() => {
    getBackgroundSettings.mockReset();
    setKeepRunningInTray.mockReset();
    setStartWithWindows.mockReset();
    toastError.mockReset();
    useBackgroundStore.setState({ settings: null, loadError: null, pendingSaves: 0 });
  });

  it("stores the settings once they are read", async () => {
    getBackgroundSettings.mockResolvedValue(saved);
    await useBackgroundStore.getState().load();
    expect(useBackgroundStore.getState().settings).toEqual(saved);
    expect(useBackgroundStore.getState().loadError).toBeNull();
  });

  it("keeps the settings null and the error when the read fails", async () => {
    getBackgroundSettings.mockRejectedValue("offline");
    await useBackgroundStore.getState().load();
    expect(useBackgroundStore.getState().settings).toBeNull();
    expect(useBackgroundStore.getState().loadError).toBe("offline");
  });

  it("does nothing to a switch before the settings are loaded", async () => {
    await useBackgroundStore.getState().setKeepRunningInTray(false);
    expect(setKeepRunningInTray).not.toHaveBeenCalled();
  });

  it("shows the change at once and counts the save while it is in flight", async () => {
    useBackgroundStore.setState({ settings: saved });
    const save = deferred();
    setKeepRunningInTray.mockReturnValue(save.promise);

    const pending = useBackgroundStore.getState().setKeepRunningInTray(false);

    expect(useBackgroundStore.getState().settings?.keepRunningInTray).toBe(false);
    expect(useBackgroundStore.getState().pendingSaves).toBe(1);
    save.resolve();
    await pending;
    expect(useBackgroundStore.getState().pendingSaves).toBe(0);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("rolls back the switch and shows the reason when the save fails", async () => {
    useBackgroundStore.setState({ settings: saved });
    setStartWithWindows.mockRejectedValue("Windows refused the startup entry.");

    await useBackgroundStore.getState().setStartWithWindows(true);

    expect(useBackgroundStore.getState().settings).toEqual(saved);
    expect(useBackgroundStore.getState().pendingSaves).toBe(0);
    expect(toastError).toHaveBeenCalledWith(
      "Could not change starting with Windows",
      "Windows refused the startup entry.",
    );
  });
});

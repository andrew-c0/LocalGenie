import { describe, expect, it } from "vitest";
import type { StorageItem } from "../types";
import { buildStorageView, storageText } from "./storageUsage";

function item(overrides: Partial<StorageItem> & { id: string }): StorageItem {
  return {
    path: `C:data\${overrides.id}`,
    bytes: 0,
    exists: true,
    uninstall: "always",
    ...overrides,
  };
}

describe("storageText", () => {
  it("gives friendly text for a known id", () => {
    expect(storageText("geniex-cli")).toEqual({
      label: "GenieX CLI",
      description: "The GenieX CLI install",
    });
  });

  it("falls back to the raw id for an unknown id", () => {
    expect(storageText("new-thing")).toEqual({ label: "new-thing", description: "" });
  });

  it("no longer knows the ids the backend stopped returning", () => {
    expect(storageText("downloads")).toEqual({ label: "downloads", description: "" });
    expect(storageText("pictures")).toEqual({ label: "pictures", description: "" });
    expect(storageText("playground-images-legacy")).toEqual({
      label: "playground-images-legacy",
      description: "",
    });
  });
});

describe("buildStorageView", () => {
  it("hides locations that do not exist", () => {
    const view = buildStorageView([
      item({ id: "database", bytes: 100 }),
      item({ id: "geniex-cli", exists: false, bytes: 0 }),
    ]);
    const ids = view.groups.flatMap((group) => group.rows.map((row) => row.id));
    expect(ids).toEqual(["database"]);
  });

  it("groups rows by uninstall policy in display order", () => {
    const view = buildStorageView([
      item({ id: "playground-models", uninstall: "optional" }),
      item({ id: "database", uninstall: "always" }),
    ]);
    expect(view.groups.map((group) => group.policy)).toEqual(["always", "optional"]);
    expect(view.groups.map((group) => group.title)).toEqual([
      "Removed when you uninstall",
      "Removed only if you tick Delete the application data",
    ]);
  });

  it("hides a row with the never policy, so no never-removed group appears", () => {
    const view = buildStorageView([
      item({ id: "geniex-models", uninstall: "never", bytes: 500 }),
      item({ id: "database", uninstall: "always", bytes: 100 }),
    ]);
    const ids = view.groups.flatMap((group) => group.rows.map((row) => row.id));
    expect(ids).toEqual(["database"]);
    expect(view.groups.map((group) => group.policy)).toEqual(["always"]);
    expect(view.totalBytes).toBe(100);
  });

  it("leaves out a group with no shown rows", () => {
    const view = buildStorageView([item({ id: "database", uninstall: "always" })]);
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].policy).toBe("always");
  });

  it("totals the shown rows and leaves out hidden ones", () => {
    const view = buildStorageView([
      item({ id: "database", bytes: 1_048_576 }),
      item({ id: "benchmark-files", uninstall: "optional", bytes: 1_048_576 }),
      item({ id: "geniex-models", uninstall: "never", bytes: 999_999_999 }),
      item({ id: "geniex-cli", exists: false, bytes: 999_999_999 }),
    ]);
    expect(view.totalBytes).toBe(2_097_152);
    expect(view.total).toBe("2.0 MB");
  });

  it("formats each row size and keeps the path", () => {
    const view = buildStorageView([item({ id: "runtimes", bytes: 2048, path: "C:\rt" })]);
    const row = view.groups[0].rows[0];
    expect(row.size).toBe("2.0 KB");
    expect(row.path).toBe("C:\rt");
    expect(row.label).toBe("Playground runtimes");
  });

  it("returns no groups for an empty list", () => {
    expect(buildStorageView([])).toEqual({ groups: [], totalBytes: 0, total: "0 B" });
  });
});

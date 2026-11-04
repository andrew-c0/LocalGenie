import { describe, expect, it } from "vitest";
import { resolveSidebarCollapsed, SIDEBAR_COLLAPSED_DEFAULT } from "./sidebarPrefs";

describe("resolveSidebarCollapsed", () => {
  it("is expanded by default", () => {
    expect(SIDEBAR_COLLAPSED_DEFAULT).toBe(false);
    expect(resolveSidebarCollapsed(null)).toBe(false);
    expect(resolveSidebarCollapsed(undefined)).toBe(false);
  });

  it("keeps a stored boolean", () => {
    expect(resolveSidebarCollapsed(true)).toBe(true);
    expect(resolveSidebarCollapsed(false)).toBe(false);
  });

  it("treats a value of the wrong type as the default", () => {
    expect(resolveSidebarCollapsed("true")).toBe(false);
    expect(resolveSidebarCollapsed(1)).toBe(false);
  });
});

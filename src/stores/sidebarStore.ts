import { create } from "zustand";
import { getSidebarCollapsed, saveSidebarCollapsed } from "../services/sidebar";

interface SidebarState {
  /** True while the sidebar is the narrow icon rail. Expanded until the saved value is read. */
  collapsed: boolean;
  /** Reads the saved state once at startup. A failed read keeps the expanded sidebar. */
  loadCollapsed: () => Promise<void>;
  /** Shows or hides the labels. The change applies at once and is saved for the next run. */
  setCollapsed: (collapsed: boolean) => void;
}

/** The sidebar's collapsed state, remembered between runs (the preference table, read at startup). */
export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: false,
  loadCollapsed: async () => {
    try {
      set({ collapsed: await getSidebarCollapsed() });
    } catch (err) {
      console.warn("[sidebar] Saved sidebar state unavailable:", err);
    }
  },
  setCollapsed: (collapsed) => {
    set({ collapsed });
    saveSidebarCollapsed(collapsed).catch((err: unknown) =>
      console.warn("[sidebar] Could not save sidebar state:", err),
    );
  },
}));

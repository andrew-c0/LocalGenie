import { create } from "zustand";

interface BreadcrumbSlotState {
  /** The actions slot at the end of the breadcrumb row. Null while the row is not shown (fewer than two crumbs). */
  slot: HTMLElement | null;
  setSlot: (slot: HTMLElement | null) => void;
}

/** Holds the DOM node the row's actions portal into. Set by the slot's ref, read by `BreadcrumbActions`. */
export const useBreadcrumbSlotStore = create<BreadcrumbSlotState>()((set) => ({
  slot: null,
  setSlot: (slot) => set({ slot }),
}));

import { create } from "zustand";

interface BreadcrumbLabelState {
  /** The page the label was set on. A label applies only while the user is on that page. */
  pathname: string | null;
  /** The text for the last crumb, replacing the route's default (for example an AI Hub model's name). */
  label: string | null;
  setLabel: (pathname: string, label: string) => void;
  /** Clears the label, but only when it belongs to this page, so a page leaving cannot clear another's. */
  clearLabel: (pathname: string) => void;
}

export const useBreadcrumbLabelStore = create<BreadcrumbLabelState>()((set) => ({
  pathname: null,
  label: null,
  setLabel: (pathname, label) => set({ pathname, label }),
  clearLabel: (pathname) =>
    set((state) => (state.pathname === pathname ? { pathname: null, label: null } : state)),
}));

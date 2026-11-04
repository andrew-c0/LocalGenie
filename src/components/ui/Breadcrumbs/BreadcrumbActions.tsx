import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBreadcrumbSlotStore } from "../../../navigation/breadcrumbSlotStore";

interface BreadcrumbActionsProps {
  children: ReactNode;
}

/**
 * Renders its children at the end of the breadcrumb row, for the page that is open. Nothing shows until the
 * row has its slot (two or more crumbs). The children unmount with the page that rendered them.
 */
export function BreadcrumbActions({ children }: BreadcrumbActionsProps) {
  const slot = useBreadcrumbSlotStore((s) => s.slot);
  if (!slot) return null;
  return createPortal(children, slot);
}

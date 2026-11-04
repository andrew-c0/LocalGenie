import { useBreadcrumbSlotStore } from "../../../navigation/breadcrumbSlotStore";

/** The empty end of the breadcrumb row. `BreadcrumbActions` portals its children here. */
export function BreadcrumbActionsSlot() {
  const setSlot = useBreadcrumbSlotStore((s) => s.setSlot);
  return <div className="breadcrumbs__actions" ref={setSlot} />;
}

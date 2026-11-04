import { Breadcrumb } from "@fluentui/react-components";
import { useLocation, useNavigate } from "react-router-dom";
import { useBreadcrumbLabelStore } from "../../../navigation/breadcrumbLabelStore";
import { breadcrumbsFor } from "../../../navigation/routeUtils";
import { BreadcrumbActionsSlot } from "./BreadcrumbActionsSlot";
import { BreadcrumbCrumb } from "./BreadcrumbCrumb";
import "./Breadcrumbs.css";

/**
 * The trail to the current page, from the route table, with the page's actions at its end. Every crumb but
 * the last links back up; the last one is the page itself. Shown only with two or more crumbs, so landings
 * and top-level pages get none.
 */
export function Breadcrumbs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const pageLabel = useBreadcrumbLabelStore((s) => (s.pathname === pathname ? s.label : null));
  const crumbs = breadcrumbsFor(pathname);
  if (crumbs.length < 2) return null;

  const lastIndex = crumbs.length - 1;
  return (
    <div className="breadcrumbs">
      <div className="breadcrumbs__trail">
        <Breadcrumb aria-label="Breadcrumb">
          {crumbs.map((crumb, index) => {
            const isCurrent = index === lastIndex;
            return (
              <BreadcrumbCrumb
                key={crumb.to}
                label={isCurrent && pageLabel ? pageLabel : crumb.label}
                isCurrent={isCurrent}
                showDivider={index > 0}
                onOpen={() => navigate(crumb.to)}
              />
            );
          })}
        </Breadcrumb>
      </div>
      <BreadcrumbActionsSlot />
    </div>
  );
}

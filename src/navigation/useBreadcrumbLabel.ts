import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useBreadcrumbLabelStore } from "./breadcrumbLabelStore";

/**
 * Sets the last breadcrumb's text for the page that calls it, until the page unmounts. Pass null
 * while the name is not known yet, and the route's default (the decoded parameter) shows instead.
 */
export function useBreadcrumbLabel(label: string | null): void {
  const { pathname } = useLocation();
  const setLabel = useBreadcrumbLabelStore((s) => s.setLabel);
  const clearLabel = useBreadcrumbLabelStore((s) => s.clearLabel);

  useEffect(() => {
    if (label === null) return;
    setLabel(pathname, label);
    return () => clearLabel(pathname);
  }, [label, pathname, setLabel, clearLabel]);
}

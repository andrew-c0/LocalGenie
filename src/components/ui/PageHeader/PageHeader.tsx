import type { ReactNode } from "react";
import { PageTitle, Secondary } from "../Typography/Typography";
import "./PageHeader.css";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/** Standard page header: title, optional subtitle and action area. */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="page-header__row">
      <div className="page-header__title-block">
        <PageTitle className="page-header__title">{title}</PageTitle>
        {subtitle && <Secondary className="page-header__subtitle">{subtitle}</Secondary>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

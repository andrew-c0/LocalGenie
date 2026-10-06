import type { ReactNode } from "react";
import "./PageHeader.css";

interface PageHeaderProps {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/** Standard page header: eyebrow + title + subtitle with optional action area. */
export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="lx-page-headrow">
      <div>
        <span className="lx-page-eyebrow">{eyebrow}</span>
        <h1 className="lx-page-title">{title}</h1>
        {subtitle && <p className="lx-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="lx-page-actions">{actions}</div>}
    </div>
  );
}

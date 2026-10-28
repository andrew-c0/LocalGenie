import { Card, CardHeader } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { PageHeader } from "../ui/PageHeader/PageHeader";
import { Body, CardTitle } from "../ui/Typography/Typography";
import "./ModelDetailLayout.css";

interface ModelDetailLayoutProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** The sections the source fills in: facts, downloads, files and the model card. */
  children: ReactNode;
}

/** Page shell shared by every model detail page: the header, then the source's sections. */
export function ModelDetailLayout({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: ModelDetailLayoutProps) {
  return (
    <div className="model-detail__page">
      <div className="model-detail__inner">
        <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} />
        {children}
      </div>
    </div>
  );
}

/** The model card section. Without content it says there is none. */
export function ModelCardPanel({ children }: { children?: ReactNode }) {
  return (
    <Card>
      <CardHeader header={<CardTitle>Model Card</CardTitle>} />
      {children ?? <Body>No model card available for this model.</Body>}
    </Card>
  );
}

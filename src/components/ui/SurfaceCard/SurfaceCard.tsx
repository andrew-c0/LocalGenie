import { Card, CardHeader } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { CardTitle } from "../Typography/Typography";
import "./SurfaceCard.css";

/** Card container with an optional title row and action area. */
export function SurfaceCard({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      {(title || action) && (
        <CardHeader
          header={<CardTitle>{title}</CardTitle>}
          action={action ? <div>{action}</div> : undefined}
        />
      )}
      <div className="surface-card__card-body">{children}</div>
    </Card>
  );
}

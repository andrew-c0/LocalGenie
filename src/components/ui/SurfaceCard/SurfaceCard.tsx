import { Card, CardHeader, makeStyles, Text, tokens } from "@fluentui/react-components";
import type { ReactNode } from "react";

const useStyles = makeStyles({
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
});

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
  const styles = useStyles();
  return (
    <Card className={className}>
      {(title || action) && (
        <CardHeader
          header={<Text weight="semibold">{title}</Text>}
          action={action ? <div>{action}</div> : undefined}
        />
      )}
      <div className={styles.cardBody}>{children}</div>
    </Card>
  );
}

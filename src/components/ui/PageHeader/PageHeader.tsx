import { Body1, Caption1Strong, makeStyles, Title2, tokens } from "@fluentui/react-components";
import type { ReactNode } from "react";

const useStyles = makeStyles({
  row: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL} 0`,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
});

interface PageHeaderProps {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/** Standard page header: eyebrow + title + subtitle with optional action area. */
export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  const styles = useStyles();
  return (
    <div className={styles.row}>
      <div>
        <Caption1Strong>{eyebrow}</Caption1Strong>
        <Title2 as="h1">{title}</Title2>
        {subtitle && <Body1>{subtitle}</Body1>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

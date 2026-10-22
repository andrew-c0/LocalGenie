import { Body1, Caption1Strong, makeStyles, Title2, tokens } from "@fluentui/react-components";
import type { ReactNode } from "react";

const useStyles = makeStyles({
  row: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL} 0`,
  },
  titleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
  },
  title: {
    margin: 0,
    overflowWrap: "anywhere",
  },
  subtitle: {
    color: tokens.colorNeutralForeground2,
    maxWidth: "720px",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
});

interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/** Standard page header: optional eyebrow, title, optional subtitle and action area. */
export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  const styles = useStyles();
  return (
    <div className={styles.row}>
      <div className={styles.titleBlock}>
        {eyebrow && <Caption1Strong block>{eyebrow}</Caption1Strong>}
        <Title2 as="h1" block className={styles.title}>
          {title}
        </Title2>
        {subtitle && (
          <Body1 block className={styles.subtitle}>
            {subtitle}
          </Body1>
        )}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

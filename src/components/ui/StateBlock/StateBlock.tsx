import { makeStyles, Text, tokens } from "@fluentui/react-components";
import type { ReactNode } from "react";

const useStyles = makeStyles({
  stateBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalXL,
    textAlign: "center",
  },
});

/** Empty / loading / error state block. */
export function StateBlock({
  icon,
  message,
  children,
}: {
  icon?: ReactNode;
  message: ReactNode;
  children?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <div className={styles.stateBlock}>
      {icon && <Text size={600}>{icon}</Text>}
      <Text>{message}</Text>
      {children}
    </div>
  );
}

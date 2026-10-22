import { Body1, Button, makeStyles, Title3, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacingVerticalM,
    height: "100%",
    padding: tokens.spacingHorizontalXL,
    textAlign: "center",
  },
});

interface ErrorFallbackProps {
  message: string;
  onReset: () => void;
}

/** Shown by ErrorBoundary when rendering fails. */
export function ErrorFallback({ message, onReset }: ErrorFallbackProps) {
  const styles = useStyles();
  return (
    <div className={styles.root} role="alert">
      <Title3 as="h2">Something went wrong</Title3>
      <Body1>{message}</Body1>
      <Button appearance="primary" onClick={onReset}>
        Try Again
      </Button>
    </div>
  );
}

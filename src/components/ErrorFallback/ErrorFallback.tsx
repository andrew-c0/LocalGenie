import { Body1, Button, Title3 } from "@fluentui/react-components";
import "./ErrorFallback.css";

interface ErrorFallbackProps {
  message: string;
  onReset: () => void;
}

/** Shown by ErrorBoundary when rendering fails. */
export function ErrorFallback({ message, onReset }: ErrorFallbackProps) {
  return (
    <div className="error-fallback__root" role="alert">
      <Title3 as="h2">Something went wrong</Title3>
      <Body1>{message}</Body1>
      <Button appearance="primary" onClick={onReset}>
        Try Again
      </Button>
    </div>
  );
}

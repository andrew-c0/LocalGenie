import { MessageBar, MessageBarBody } from "@fluentui/react-components";

/** Inline error banner used across pages. */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <MessageBar intent="error">
      <MessageBarBody>{message}</MessageBarBody>
    </MessageBar>
  );
}

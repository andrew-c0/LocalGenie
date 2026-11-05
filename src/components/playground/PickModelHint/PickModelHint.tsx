import { MessageBar, MessageBarBody } from "@fluentui/react-components";

/** Shown at the top of a tool page while no model is chosen. The models are picked in the header's selector. */
export function PickModelHint() {
  return (
    <MessageBar intent="info">
      <MessageBarBody>Pick a model in the selector above</MessageBarBody>
    </MessageBar>
  );
}

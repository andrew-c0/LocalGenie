import { Button, Tooltip } from "@fluentui/react-components";

interface UpscaleButtonProps {
  label: string;
  /** Why the button is off. Null when it can run. Shown as a tooltip on the disabled button. */
  blockedReason: string | null;
  onClick: () => void;
}

/**
 * The Upscale button. While it is blocked it stays focusable, so hovering or tabbing to it shows the reason in a
 * tooltip (a plain disabled button would not react to the pointer).
 */
export function UpscaleButton({ label, blockedReason, onClick }: UpscaleButtonProps) {
  const button = (
    <Button
      appearance="primary"
      disabledFocusable={blockedReason !== null}
      onClick={blockedReason === null ? onClick : undefined}
    >
      {label}
    </Button>
  );
  if (blockedReason === null) return button;
  return (
    <Tooltip content={blockedReason} relationship="description" withArrow>
      {button}
    </Tooltip>
  );
}

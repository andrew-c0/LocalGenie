import { Button, Spinner } from "@fluentui/react-components";
import { SaveRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";
import type { SettingsButton } from "../../utils/settingsButtons";
import type { ActionState } from "./sections/types";

interface Props {
  button: SettingsButton;
  actions: ActionState;
}

/** A save, scan or cancel button. It shows a spinner while its own save runs. */
export default function SettingsActionButton({ button, actions }: Props) {
  const { pending, blocked, runAction } = actions;
  const isSave = button.action === "save" || button.action === "saveAndLoad";
  let icon: ReactElement | undefined;
  if (button.action === pending) icon = <Spinner size="tiny" />;
  else if (isSave) icon = <SaveRegular />;

  return (
    <Button
      appearance={button.appearance}
      icon={icon}
      disabled={button.action !== "cancelScan" && blocked}
      onClick={runAction[button.action]}
    >
      {button.label}
    </Button>
  );
}

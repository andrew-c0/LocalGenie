import { Button } from "@fluentui/react-components";
import { useNavigate } from "react-router-dom";
import { StateBlock } from "../../ui/StateBlock/StateBlock";

interface RuntimeNoticeProps {
  /** What the tab needs, e.g. "Image generation needs stable-diffusion.cpp. Install it in Settings > Runtimes." */
  message: string;
}

/** Shown when a tab's runtime is not installed. The button opens Settings > Runtimes. */
export function RuntimeNotice({ message }: RuntimeNoticeProps) {
  const navigate = useNavigate();
  return (
    <StateBlock icon="🧩" message={message}>
      <Button appearance="secondary" onClick={() => navigate("/settings/runtimes")}>
        Open Runtimes
      </Button>
    </StateBlock>
  );
}

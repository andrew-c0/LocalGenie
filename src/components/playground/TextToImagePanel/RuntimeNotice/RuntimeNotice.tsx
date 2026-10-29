import { Button } from "@fluentui/react-components";
import { useNavigate } from "react-router-dom";
import { StateBlock } from "../../../ui/StateBlock/StateBlock";

/** Shown when stable-diffusion.cpp is not installed. The button opens Settings > Runtimes. */
export function RuntimeNotice() {
  const navigate = useNavigate();
  return (
    <StateBlock
      icon="🧩"
      message="Image generation needs stable-diffusion.cpp. Install it in Settings > Runtimes."
    >
      <Button appearance="secondary" onClick={() => navigate("/settings/runtimes")}>
        Open Runtimes
      </Button>
    </StateBlock>
  );
}

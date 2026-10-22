import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
} from "@fluentui/react-components";
import { open } from "@tauri-apps/plugin-shell";
import { useModelStore } from "../../../stores/modelStore";
import "./CliMissingBanner.css";

const GENIEX_RELEASES_URL = "https://github.com/qualcomm/GenieX/releases";

/**
 * Banner shown when the GenieX CLI is missing. Automatic installation is not
 * available in this build, so it links to the release page instead.
 */
export default function CliMissingBanner() {
  const cliInstalled = useModelStore((s) => s.cliInstalled);

  if (cliInstalled) return null;

  return (
    <MessageBar intent="warning" layout="multiline" className="cli-missing-banner__banner">
      <MessageBarBody>
        <MessageBarTitle>GenieX CLI not found</MessageBarTitle>
        Install it from the GenieX releases page to use model management and chatting.
      </MessageBarBody>
      <MessageBarActions>
        <Button
          appearance="primary"
          onClick={() => open(GENIEX_RELEASES_URL).catch((err) => console.error(err))}
        >
          Open releases page
        </Button>
      </MessageBarActions>
    </MessageBar>
  );
}

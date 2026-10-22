import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { open } from "@tauri-apps/plugin-shell";
import { useModelStore } from "../../stores/modelStore";

const GENIEX_RELEASES_URL = "https://github.com/qualcomm/GenieX/releases";

const useStyles = makeStyles({
  banner: {
    margin: tokens.spacingHorizontalM,
    marginBottom: 0,
  },
});

/**
 * Banner shown when the GenieX CLI is missing. Automatic installation is not
 * available in this build, so it links to the release page instead.
 */
export default function CliMissingBanner() {
  const styles = useStyles();
  const cliInstalled = useModelStore((s) => s.cliInstalled);

  if (cliInstalled) return null;

  return (
    <MessageBar intent="warning" layout="multiline" className={styles.banner}>
      <MessageBarBody>
        <MessageBarTitle>GenieX CLI not found</MessageBarTitle>
        Install it from the GenieX releases page to use model management and chatting.
      </MessageBarBody>
      <MessageBarActions>
        <Button
          appearance="primary"
          size="small"
          onClick={() => open(GENIEX_RELEASES_URL).catch((err) => console.error(err))}
        >
          Open releases page
        </Button>
      </MessageBarActions>
    </MessageBar>
  );
}

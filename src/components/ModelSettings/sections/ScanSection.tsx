import { MessageBar, MessageBarBody, Spinner, Subtitle1 } from "@fluentui/react-components";
import type { SettingsButton } from "../../../utils/settingsButtons";
import { Flex } from "../../ui/Flex/Flex";
import { ProgressBar } from "../../ui/ProgressBar/ProgressBar";
import { Body } from "../../ui/Typography/Typography";
import SettingsActionButton from "../SettingsActionButton";
import type { CapabilityScanState } from "../useCapabilityScan";
import type { ActionState } from "./types";

interface Props {
  scan: CapabilityScanState;
  scanButtons: SettingsButton[];
  actions: ActionState;
}

/** Scans the model's settings against the server, with its progress and the scan buttons. */
export default function ScanSection({ scan, scanButtons, actions }: Props) {
  return (
    <section className="model-settings__section">
      <Subtitle1>Available settings</Subtitle1>
      <Body className="model-settings__hint">
        Tests each setting with a few short requests, using a fixed test setup rather than your
        saved settings. Reload &amp; Scan unloads every model, then loads this one with that setup.
      </Body>
      {scan.entries.some((e) => e.stale) ? (
        <Body className="model-settings__hint">
          Some results are out of date because the model file or GenieX changed. Scan again to
          refresh them.
        </Body>
      ) : (
        scan.entries.length === 0 && <Body className="model-settings__hint">Not scanned yet.</Body>
      )}
      {scan.error && (
        <MessageBar intent="error">
          <MessageBarBody>{scan.error}</MessageBarBody>
        </MessageBar>
      )}
      {scan.phase === "loading" && (
        <Spinner size="tiny" label="Loading the model with the scan setup…" />
      )}
      {scan.phase === "scanning" &&
        (scan.progress ? (
          <Flex direction="column" gap="xs">
            <ProgressBar value={(scan.progress.index / scan.progress.total) * 100} />
            <Body>
              Testing {scan.progress.key} ({scan.progress.index + 1} of {scan.progress.total})
            </Body>
          </Flex>
        ) : (
          <Spinner size="tiny" label="Starting the scan…" />
        ))}
      <Flex gap="s" wrap>
        {scanButtons.map((button) => (
          <SettingsActionButton key={button.action} button={button} actions={actions} />
        ))}
      </Flex>
    </section>
  );
}

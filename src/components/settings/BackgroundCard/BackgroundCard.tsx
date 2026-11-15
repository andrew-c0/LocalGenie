import { Card, Switch } from "@fluentui/react-components";
import { useBackgroundStore } from "../../../stores/backgroundStore";
import type { BackgroundSettings } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { Flex } from "../../ui/Flex/Flex";
import { Meta, SectionTitle } from "../../ui/Typography/Typography";

/** What the switches show before the saved settings are read. They are disabled until then, and both are off. */
const SHOWN_BEFORE_LOAD: BackgroundSettings = { keepRunningInTray: false, startWithWindows: false };

/** Edits whether closing the window keeps LocalGenie in the tray, and whether it starts with Windows. */
export default function BackgroundCard() {
  const settings = useBackgroundStore((s) => s.settings);
  const loadError = useBackgroundStore((s) => s.loadError);
  const pendingSaves = useBackgroundStore((s) => s.pendingSaves);
  const setKeepRunningInTray = useBackgroundStore((s) => s.setKeepRunningInTray);
  const setStartWithWindows = useBackgroundStore((s) => s.setStartWithWindows);

  const shown = settings ?? SHOWN_BEFORE_LOAD;
  const disabled = settings === null || pendingSaves > 0;

  return (
    <Card>
      <Flex direction="column" gap="s">
        <SectionTitle>Background</SectionTitle>
        <Switch
          label="Keep running in the tray when the window is closed"
          checked={shown.keepRunningInTray}
          disabled={disabled}
          onChange={(_, data) => void setKeepRunningInTray(data.checked)}
        />
        <Meta>
          Closing the window hides LocalGenie to the tray instead of quitting. Use Exit in the tray
          menu to quit. A loaded model keeps using memory while it runs.
        </Meta>
        <Switch
          label="Start LocalGenie when I sign in to Windows"
          checked={shown.startWithWindows}
          disabled={disabled}
          onChange={(_, data) => void setStartWithWindows(data.checked)}
        />
        <Meta>Starts hidden in the tray.</Meta>
        {loadError !== null && (
          <Meta>Background settings could not be read: {errorMessage(loadError)}</Meta>
        )}
      </Flex>
    </Card>
  );
}

import { Card, Switch } from "@fluentui/react-components";
import { useRuntimeNoticeStore } from "../../../stores/runtimeNoticeStore";
import { NOTIFY_RUNTIME_UPDATES_DEFAULT } from "../../../utils/runtimeUpdateNoticePrefs";
import { Flex } from "../../ui/Flex/Flex";
import { Meta, SectionTitle } from "../../ui/Typography/Typography";

/** Turns desktop notifications for runtime updates on or off. Each new version is notified once. */
export default function RuntimeUpdateNoticeCard() {
  const notifyEnabled = useRuntimeNoticeStore((s) => s.notifyEnabled);
  const setNotifyEnabled = useRuntimeNoticeStore((s) => s.setNotifyEnabled);

  return (
    <Card>
      <Flex direction="column" gap="s">
        <SectionTitle>Runtime updates</SectionTitle>
        <Switch
          label="Notify me when a runtime update is available"
          checked={notifyEnabled ?? NOTIFY_RUNTIME_UPDATES_DEFAULT}
          disabled={notifyEnabled === null}
          onChange={(_, data) => setNotifyEnabled(data.checked)}
        />
        <Meta>
          Checked when the app starts and every 6 hours. Each new version is announced once.
        </Meta>
      </Flex>
    </Card>
  );
}

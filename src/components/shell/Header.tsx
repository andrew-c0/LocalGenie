import {
  Badge,
  Button,
  makeStyles,
  Popover,
  PopoverTrigger,
  Text,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, ChevronDownRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { isDownloadActive, useDownloadStore } from "../../stores/downloadStore";
import { useModelStore } from "../../stores/modelStore";
import DownloadDrawer from "./DownloadDrawer";
import ModelSelectorPopover from "./ModelSelectorPopover";

const useStyles = makeStyles({
  bar: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  spacer: {
    flex: 1,
  },
});

export default function Header() {
  const styles = useStyles();
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const selectorOpen = useModelStore((s) => s.selectorOpen);
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const activeDownloads = useDownloadStore(
    (s) => s.downloads.filter((d) => isDownloadActive(d.status)).length,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeLabel = activeModelId
    ? activeModelId.split("/").pop()
    : serverStatus.models.length > 0
      ? serverStatus.models[0].split("/").pop()
      : "No model loaded";

  return (
    <div className={styles.bar}>
      <Popover
        open={selectorOpen}
        onOpenChange={(_, data) => setSelectorOpen(data.open)}
        positioning="below-start"
      >
        <PopoverTrigger disableButtonEnhancement>
          <Button
            appearance="subtle"
            icon={<ChevronDownRegular />}
            iconPosition="after"
            aria-label="Switch active model"
            title="Switch active model"
          >
            <Text weight="semibold">Active Model:</Text> <Text font="monospace">{activeLabel}</Text>
          </Button>
        </PopoverTrigger>
        <ModelSelectorPopover />
      </Popover>

      <Badge
        appearance="tint"
        color={serverStatus.running ? "success" : "danger"}
        title={`GenieX server on port ${serverStatus.port}`}
      >
        {serverStatus.running ? "Connected" : "Offline"}
      </Badge>

      {serverStatus.models.length > 0 && (
        <Badge appearance="filled" color="brand" size="small">
          {serverStatus.models.length} loaded
        </Badge>
      )}

      {activeDownloads > 0 && (
        <Badge appearance="tint" color="informative" size="small">
          {activeDownloads} downloading
        </Badge>
      )}

      <div className={styles.spacer} />

      <Button
        appearance={activeDownloads > 0 ? "primary" : "subtle"}
        icon={<ArrowDownloadRegular />}
        title="Downloads"
        aria-label="Downloads"
        onClick={() => setDrawerOpen(true)}
      >
        {activeDownloads > 0 ? String(activeDownloads) : undefined}
      </Button>

      <DownloadDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}

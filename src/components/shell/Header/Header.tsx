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
  selectorButton: {
    flex: 1,
    minWidth: 0,
    justifyContent: "space-between",
  },
  label: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
    overflow: "hidden",
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
      : null;

  return (
    <div className={styles.bar}>
      <Popover
        open={selectorOpen}
        onOpenChange={(_, data) => setSelectorOpen(data.open)}
        positioning={{ position: "below", align: "start", matchTargetSize: "width" }}
      >
        <PopoverTrigger disableButtonEnhancement>
          <Button
            appearance="subtle"
            className={styles.selectorButton}
            icon={<ChevronDownRegular />}
            iconPosition="after"
            aria-label="Switch active model"
            title="Switch active model"
          >
            <span className={styles.label}>
              <Text weight="semibold">{activeLabel ? "Active Model:" : "Model selector:"}</Text>
              <Text>{activeLabel ?? "no model loaded"}</Text>
            </span>
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

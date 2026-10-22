import { Badge, Button, Popover, PopoverTrigger } from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ChevronDownRegular,
  PlugConnectedRegular,
  PlugDisconnectedRegular,
} from "@fluentui/react-icons";
import { useState } from "react";
import { isDownloadActive, useDownloadStore } from "../../../stores/downloadStore";
import { useModelStore } from "../../../stores/modelStore";
import { Flex } from "../../ui/Flex/Flex";
import DownloadDrawer from "../DownloadDrawer/DownloadDrawer";
import ModelSelectorPopover from "./ModelSelectorPopover/ModelSelectorPopover";
import { useModelLoader } from "./useModelLoader";
import "./Header.css";

/** Top bar: active model selector (which owns model loading), server status and the downloads button. */
export default function Header() {
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const selectorOpen = useModelStore((s) => s.selectorOpen);
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const activeDownloads = useDownloadStore(
    (s) => s.downloads.filter((d) => isDownloadActive(d.status)).length,
  );
  const { loading, error, selectModel, changeCompute, unloadAll } = useModelLoader();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeLabel = activeModelId
    ? activeModelId.split("/").pop()
    : serverStatus.models.length > 0
      ? serverStatus.models[0].split("/").pop()
      : null;

  return (
    <Flex align="center" gap="s" className="header">
      <Popover
        open={selectorOpen}
        onOpenChange={(_, data) => setSelectorOpen(data.open)}
        positioning={{ position: "below", align: "start", matchTargetSize: "width" }}
      >
        <PopoverTrigger disableButtonEnhancement>
          <Button
            appearance="secondary"
            icon={<ChevronDownRegular />}
            iconPosition="after"
            aria-label="Switch active model"
            title="Switch active model"
            className="flex-grow"
          >
            {activeLabel ? `Active Model: ${activeLabel}` : "Model selector: no model loaded"}
          </Button>
        </PopoverTrigger>
        <ModelSelectorPopover
          loading={loading}
          error={error}
          onSelect={selectModel}
          onComputeChange={changeCompute}
          onUnload={unloadAll}
        />
      </Popover>

      <Badge
        className="header__status"
        shape="square"
        appearance="tint"
        color={serverStatus.running ? "success" : "danger"}
        icon={serverStatus.running ? <PlugConnectedRegular /> : <PlugDisconnectedRegular />}
        title={serverStatus.running ? "Connected" : "Offline"}
        aria-label={serverStatus.running ? "Connected" : "Offline"}
      />

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
    </Flex>
  );
}

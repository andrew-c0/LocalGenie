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
import { loadedComputes } from "../../../utils/loadedServers";
import { extraLoadedLabel } from "../../../utils/modelSelector";
import { COMPUTE_PORT_LABELS } from "../../../utils/serverPorts";
import { Flex } from "../../ui/Flex/Flex";
import DownloadDrawer from "../DownloadDrawer/DownloadDrawer";
import ModelSelectorPopover from "./ModelSelectorPopover/ModelSelectorPopover";
import { useModelLoader } from "./useModelLoader";
import "./Header.css";

/** Top bar: active model selector (which owns model loading), server status and the downloads button. */
export default function Header() {
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const activeCompute = useModelStore((s) => s.activeCompute);
  const loadedServers = useModelStore((s) => s.loadedServers);
  const selectorOpen = useModelStore((s) => s.selectorOpen);
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const activeDownloads = useDownloadStore(
    (s) => s.downloads.filter((d) => isDownloadActive(d.status)).length,
  );
  const loader = useModelLoader();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeName = activeModelId ?? serverStatus.models[0] ?? null;
  const activeLabel = activeName ? activeName.split("/").pop() : null;
  const moreLoadedLabel = extraLoadedLabel(loadedComputes(loadedServers).length);

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
            className="flex-grow header__model"
          >
            {activeLabel ? (
              <>
                <span className="header__model-label">{`Active Model: ${activeLabel}`}</span>
                {activeCompute && (
                  <Badge appearance="tint" color="brand" size="small">
                    {COMPUTE_PORT_LABELS[activeCompute]}
                  </Badge>
                )}
              </>
            ) : (
              "Model selector: no model loaded"
            )}
            {moreLoadedLabel && (
              <Badge appearance="outline" size="small">
                {moreLoadedLabel}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <ModelSelectorPopover loader={loader} />
      </Popover>

      <Badge
        className="header__status"
        shape="square"
        appearance="tint"
        color={serverStatus.running ? "success" : "danger"}
        icon={serverStatus.running ? <PlugConnectedRegular /> : <PlugDisconnectedRegular />}
        title={serverStatus.running ? "Running" : "Stopped"}
        aria-label={serverStatus.running ? "Running" : "Stopped"}
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

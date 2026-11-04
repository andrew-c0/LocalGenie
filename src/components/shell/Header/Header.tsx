import { Badge, Button } from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  PlugConnectedRegular,
  PlugDisconnectedRegular,
} from "@fluentui/react-icons";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { isPlaygroundPath } from "../../../navigation/routeUtils";
import { isDownloadActive, useDownloadStore } from "../../../stores/downloadStore";
import { useModelStore } from "../../../stores/modelStore";
import { Flex } from "../../ui/Flex/Flex";
import DownloadDrawer from "../DownloadDrawer/DownloadDrawer";
import { ChatModelSelector } from "./ChatModelSelector/ChatModelSelector";
import { PlaygroundModelSelector } from "./PlaygroundModelSelector/PlaygroundModelSelector";
import { useModelLoader } from "./useModelLoader";
import "./Header.css";

/**
 * Top bar: the model selector (the chat selector, or the Playground's on the Playground pages), server
 * status and the downloads button. The loader runs here on every page, so a load or the server's stop
 * event is handled wherever the user is.
 */
export default function Header() {
  const { pathname } = useLocation();
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeDownloads = useDownloadStore(
    (s) => s.downloads.filter((d) => isDownloadActive(d.status)).length,
  );
  const { loading, error, selectModel, changeCompute, unloadAll } = useModelLoader();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <Flex align="center" gap="s" className="header">
      {isPlaygroundPath(pathname) ? (
        <PlaygroundModelSelector />
      ) : (
        <ChatModelSelector
          loading={loading}
          error={error}
          onSelect={selectModel}
          onComputeChange={changeCompute}
          onUnload={unloadAll}
        />
      )}

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

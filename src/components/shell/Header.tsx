import { Badge, Button } from "@fluentui/react-components";
import { ArrowDownloadRegular, ChevronDownRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { useDownloadStore } from "../../stores/downloadStore";
import { useModelStore } from "../../stores/modelStore";
import DownloadDrawer from "./DownloadDrawer";
import ModelSelectorPopover from "./ModelSelectorPopover";

export default function Header() {
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const selectorOpen = useModelStore((s) => s.selectorOpen);
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const downloads = useModelStore((s) => s.downloads);
  const activeDownloads = useDownloadStore(
    (s) => s.downloads.filter((d) => d.status === "downloading").length,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeLabel = activeModelId
    ? activeModelId.split("/").pop()
    : serverStatus.models.length > 0
      ? serverStatus.models[0].split("/").pop()
      : "No model loaded";

  return (
    <div className="lx-titlebar">
      <div className="lx-titlebar-model-wrap">
        <button
          type="button"
          className={`lx-titlebar-model${selectorOpen ? " open" : ""}`}
          onClick={() => setSelectorOpen(!selectorOpen)}
          aria-expanded={selectorOpen}
          aria-haspopup="dialog"
          title="Switch active model"
        >
          <span
            className="dot"
            style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--lx-primary)" }}
          />
          <strong>Active Model:</strong>
          <span className="lx-mono">{activeLabel}</span>
          <ChevronDownRegular
            style={{
              transform: selectorOpen ? "rotate(180deg)" : undefined,
              transition: "transform 0.15s ease",
            }}
          />
        </button>

        <ModelSelectorPopover
          open={selectorOpen}
          onClose={() => setSelectorOpen(false)}
          onOpenChange={setSelectorOpen}
        />
      </div>

      <span
        className={`lx-titlebar-chip${serverStatus.running ? "" : " off"}`}
        title={`GenieX server on port ${serverStatus.port}`}
      >
        <span className="dot" />
        {serverStatus.running ? "Connected" : "Offline"}
      </span>

      {serverStatus.models.length > 0 && (
        <Badge appearance="filled" color="brand" size="small">
          {serverStatus.models.length} loaded
        </Badge>
      )}

      {downloads.length > 0 && (
        <Badge appearance="tint" color="informative" size="small">
          {downloads.length} downloading
        </Badge>
      )}

      <div className="lx-titlebar-spacer" />

      <Button
        appearance="transparent"
        size="small"
        icon={<ArrowDownloadRegular />}
        title="Downloads"
        aria-label="Downloads"
        onClick={() => setDrawerOpen(true)}
        style={activeDownloads > 0 ? { color: "var(--lx-primary)" } : undefined}
      >
        {activeDownloads > 0 ? `${activeDownloads}` : undefined}
      </Button>

      <DownloadDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}

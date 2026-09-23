import { Badge } from "@fluentui/react-components";
import { ChevronDownRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { useModelStore } from "../../stores/modelStore";
import ModelSelectorPopover from "./ModelSelectorPopover";

export default function Header() {
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const downloads = useModelStore((s) => s.downloads);
  const [selectorOpen, setSelectorOpen] = useState(false);

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
          onClick={() => setSelectorOpen((v) => !v)}
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

        <ModelSelectorPopover open={selectorOpen} onClose={() => setSelectorOpen(false)} />
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
    </div>
  );
}

import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { Button, CounterBadge, Tab, TabList, Tooltip } from "@fluentui/react-components";
import {
  BeakerRegular,
  ChatRegular,
  CubeRegular,
  GridRegular,
  PlayCircleRegular,
  SettingsRegular,
  SparkleRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useRuntimeLocks } from "../../../hooks/useRuntimeLocks";
import { useModelStore } from "../../../stores/modelStore";
import type { RuntimeNeed } from "../../../utils/runtimeGuards";
import { SystemUsage } from "../SystemUsage/SystemUsage";
import "./Sidebar.css";

/** `needs` is the runtime an area cannot work without; the item is locked while it is missing. */
const NAV_ITEMS: { to: string; label: string; icon: ReactElement; needs?: RuntimeNeed }[] = [
  { to: "/", label: "Overview", icon: <GridRegular /> },
  { to: "/models", label: "Models", icon: <CubeRegular />, needs: "cli" },
  { to: "/chat", label: "Chat", icon: <ChatRegular />, needs: "cli" },
  { to: "/playground", label: "Playground", icon: <BeakerRegular /> },
  { to: "/benchmarks", label: "Benchmarks", icon: <PlayCircleRegular />, needs: "cli" },
  { to: "/settings", label: "Settings", icon: <SettingsRegular /> },
];

/** Map the current pathname to the nav item it belongs to (Tab value). */
function activeNavValue(pathname: string): string {
  const match = NAV_ITEMS.find(
    (item) => item.to !== "/" && (pathname === item.to || pathname.startsWith(`${item.to}/`)),
  );
  return match ? match.to : "/";
}

/** App navigation sidebar: the page tabs, the installed-model count and the usage chart footer. */
export default function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const models = useModelStore((s) => s.models);
  const lockedReason = useRuntimeLocks();

  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    navigate(String(data.value));
  };

  return (
    <aside className="sidebar">
      <Button appearance="secondary" icon={<SparkleRegular />} onClick={() => navigate("/")}>
        LocalGenie
      </Button>

      <TabList
        vertical
        aria-label="Main navigation"
        selectedValue={activeNavValue(pathname)}
        onTabSelect={handleTabSelect}
      >
        {NAV_ITEMS.map((item) => {
          const reason = item.needs ? lockedReason(item.needs) : null;
          const tab = (
            <Tab key={item.to} value={item.to} icon={item.icon} disabled={reason !== null}>
              {item.label}{" "}
              {item.to === "/models" && models.length > 0 && (
                <CounterBadge
                  count={models.length}
                  size="small"
                  appearance="filled"
                  color="brand"
                />
              )}
            </Tab>
          );
          // A disabled button gets no hover events, so the tooltip sits on a wrapper around it.
          return reason ? (
            <Tooltip key={item.to} content={reason} relationship="description" positioning="after">
              <span>{tab}</span>
            </Tooltip>
          ) : (
            tab
          );
        })}
      </TabList>

      <div className="sidebar__footer">
        <SystemUsage />
      </div>
    </aside>
  );
}

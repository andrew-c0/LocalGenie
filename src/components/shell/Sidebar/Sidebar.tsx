import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { Button, Caption1, CounterBadge, Tab, TabList, Text } from "@fluentui/react-components";
import {
  ChatRegular,
  CubeRegular,
  GridRegular,
  PlayCircleRegular,
  SettingsRegular,
  SparkleRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useModelStore } from "../../../stores/modelStore";
import "./Sidebar.css";

const APP_VERSION = "v0.1.0";

const NAV_ITEMS: { to: string; label: string; icon: ReactElement }[] = [
  { to: "/", label: "Overview", icon: <GridRegular /> },
  { to: "/models", label: "Models", icon: <CubeRegular /> },
  { to: "/chat", label: "Chat & Playground", icon: <ChatRegular /> },
  { to: "/prompt-benchmark", label: "Benchmarks", icon: <PlayCircleRegular /> },
  { to: "/settings", label: "Settings", icon: <SettingsRegular /> },
];

/** Map the current pathname to the nav item it belongs to (Tab value). */
function activeNavValue(pathname: string): string {
  const match = NAV_ITEMS.find(
    (item) => item.to !== "/" && (pathname === item.to || pathname.startsWith(`${item.to}/`)),
  );
  return match ? match.to : "/";
}

/** App navigation sidebar: the page tabs, the installed-model count and the server footer. */
export default function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);

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
        {NAV_ITEMS.map((item) => (
          <Tab key={item.to} value={item.to} icon={item.icon}>
            {item.label}{" "}
            {item.to === "/models" && models.length > 0 && (
              <CounterBadge count={models.length} size="small" appearance="filled" color="brand" />
            )}
          </Tab>
        ))}
      </TabList>

      <div className="sidebar__footer">
        <Text size={200}>
          {serverStatus.running
            ? `Server :${serverStatus.port} · ${serverStatus.models.length} loaded`
            : "Server offline"}
        </Text>
        <Caption1>{APP_VERSION} · Local Runtime</Caption1>
      </div>
    </aside>
  );
}

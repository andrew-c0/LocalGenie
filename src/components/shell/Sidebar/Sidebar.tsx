import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { Button, TabList, Tooltip } from "@fluentui/react-components";
import { SparkleRegular } from "@fluentui/react-icons";
import { useLocation, useNavigate } from "react-router-dom";
import { useRuntimeLocks } from "../../../hooks/useRuntimeLocks";
import { ROUTES } from "../../../navigation/routes";
import { sectionOf } from "../../../navigation/routeUtils";
import { useModelStore } from "../../../stores/modelStore";
import { useSidebarStore } from "../../../stores/sidebarStore";
import { Flex } from "../../ui/Flex/Flex";
import { SystemUsage } from "../SystemUsage/SystemUsage";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarRailItem } from "./SidebarRailItem";
import { SidebarToggle } from "./SidebarToggle";
import "./Sidebar.css";

/**
 * App navigation sidebar: the collapse toggle, the brand button, the page tabs (from the route table),
 * the installed-model count and the usage chart footer. Collapsed, it is an icon rail; the footer chart
 * is hidden there because it does not fit.
 */
export default function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const models = useModelStore((s) => s.models);
  const lockedReason = useRuntimeLocks();
  const collapsed = useSidebarStore((s) => s.collapsed);
  const setCollapsed = useSidebarStore((s) => s.setCollapsed);

  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    navigate(String(data.value));
  };

  const brand = (
    <Button
      appearance="secondary"
      icon={<SparkleRegular />}
      aria-label={collapsed ? "LocalGenie" : undefined}
      // The label is only dropped in the rail; the expanded button fills the row.
      className={collapsed ? undefined : "flex-grow"}
      onClick={() => navigate("/")}
    >
      {collapsed ? null : "LocalGenie"}
    </Button>
  );

  return (
    <aside className={collapsed ? "sidebar sidebar--collapsed" : "sidebar"}>
      <Flex direction={collapsed ? "column" : "row"} align="center" gap="xs">
        {collapsed ? (
          <Tooltip content="LocalGenie" relationship="description" positioning="after">
            {brand}
          </Tooltip>
        ) : (
          brand
        )}
        <SidebarToggle collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </Flex>

      {/* Fluent measures the tabs to place the selection indicator. The rail swaps every tab for a different one,
          so the list is remounted with it; otherwise the indicator keeps the first tab's position. */}
      <TabList
        key={collapsed ? "rail" : "full"}
        vertical
        aria-label="Main navigation"
        selectedValue={sectionOf(pathname).path}
        onTabSelect={handleTabSelect}
      >
        {ROUTES.map((route) => {
          const navItem = {
            route,
            lockedReason: route.needs ? lockedReason(route.needs) : null,
            badgeCount: route.id === "models" ? models.length : 0,
          };
          return collapsed ? (
            <SidebarRailItem key={route.id} {...navItem} />
          ) : (
            <SidebarNavItem key={route.id} {...navItem} />
          );
        })}
      </TabList>

      <div className="sidebar__footer">
        <SystemUsage />
      </div>
    </aside>
  );
}

import { Badge, CounterBadge, Tab, Tooltip } from "@fluentui/react-components";
import type { RouteMeta } from "../../../navigation/routes";

interface SidebarNavItemProps {
  route: RouteMeta;
  /** The tooltip that explains a lock, or null when the area is open. */
  lockedReason: string | null;
  /** Count shown after the title (the installed models). 0 shows no badge. */
  badgeCount: number;
  /** A small dot after the title: something on this page wants attention (an app update). */
  dot: boolean;
}

/** One page tab in the expanded sidebar: the icon, the title, the count and the attention dot. */
export function SidebarNavItem({ route, lockedReason, badgeCount, dot }: SidebarNavItemProps) {
  const tab = (
    <Tab value={route.path} icon={route.icon} disabled={lockedReason !== null}>
      {route.title}{" "}
      {badgeCount > 0 && (
        <CounterBadge count={badgeCount} size="small" appearance="filled" color="brand" />
      )}
      {dot && <Badge size="tiny" shape="circular" color="brand" aria-label="Update available" />}
    </Tab>
  );
  // A disabled button gets no hover events, so the tooltip sits on a wrapper around it.
  if (!lockedReason) return tab;
  return (
    <Tooltip content={lockedReason} relationship="description" positioning="after">
      <span className="sidebar__nav-item">{tab}</span>
    </Tooltip>
  );
}

import { Badge, CounterBadge, Tab, Tooltip } from "@fluentui/react-components";
import type { RouteMeta } from "../../../navigation/routes";

interface SidebarRailItemProps {
  route: RouteMeta;
  /** The tooltip that explains a lock, or null when the area is open. */
  lockedReason: string | null;
  /** Count shown on the icon (the installed models). 0 shows no badge. */
  badgeCount: number;
  /** A dot on the icon: something on this page wants attention (an app update). */
  dot: boolean;
}

/**
 * One page tab in the collapsed icon rail. The icon is the whole tab; its label is the tooltip (or the
 * lock reason) and the tab's accessible name. The count, or the attention dot, sits on the icon.
 */
export function SidebarRailItem({ route, lockedReason, badgeCount, dot }: SidebarRailItemProps) {
  const marker =
    badgeCount > 0 ? (
      <CounterBadge count={badgeCount} size="tiny" appearance="filled" color="brand" />
    ) : (
      <Badge size="tiny" shape="circular" color="brand" aria-label="Update available" />
    );
  const icon =
    badgeCount > 0 || dot ? (
      <span className="sidebar__rail-icon">
        {route.icon}
        <span className="sidebar__rail-badge">{marker}</span>
      </span>
    ) : (
      route.icon
    );
  const name = badgeCount > 0 ? `${route.title}, ${badgeCount} installed` : route.title;
  // A disabled tab gets no hover, so the tooltip sits on a wrapper.
  return (
    <Tooltip content={lockedReason ?? route.title} relationship="description" positioning="after">
      <span className="sidebar__nav-item">
        <Tab value={route.path} icon={icon} disabled={lockedReason !== null} aria-label={name} />
      </span>
    </Tooltip>
  );
}

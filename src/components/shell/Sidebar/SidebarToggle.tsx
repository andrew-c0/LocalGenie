import { Button, Tooltip } from "@fluentui/react-components";
import { ChevronLeftRegular, ChevronRightRegular } from "@fluentui/react-icons";

interface SidebarToggleProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Collapses the sidebar to the icon rail, or expands it again. A disclosure button: its name stays
 * the same and `aria-expanded` carries the state; the tooltip names the action.
 */
export function SidebarToggle({ collapsed, onToggle }: SidebarToggleProps) {
  return (
    <Tooltip
      content={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      relationship="description"
      positioning="after"
    >
      <Button
        appearance="secondary"
        aria-label="Navigation sidebar"
        aria-expanded={!collapsed}
        icon={collapsed ? <ChevronRightRegular /> : <ChevronLeftRegular />}
        onClick={onToggle}
      />
    </Tooltip>
  );
}

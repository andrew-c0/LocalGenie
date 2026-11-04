import {
  Button,
  Card,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
} from "@fluentui/react-components";
import { MoreHorizontalRegular } from "@fluentui/react-icons";
import { Fragment, type ReactNode } from "react";
import { openExternal } from "../../../../services/system";
import { Flex } from "../../../ui/Flex/Flex";
import { SkeletonBlock } from "../../../ui/Skeletons/SkeletonBlock";
import { CardTitle, Meta } from "../../../ui/Typography/Typography";
import "./RuntimePanel.css";

/** One entry of the "…" menu. */
export interface RuntimeMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** One part of the summary line. A part with a null node is left out. */
interface SummaryPart {
  key: string;
  node: ReactNode;
}

interface RuntimePanelProps {
  title: string;
  /** The logo or icon in the square on the left. */
  icon: ReactNode;
  /** The project, shown in the line under the title. */
  repo: string;
  installedVersion: string | null;
  /** Null when the latest release is not known. */
  latestVersion: string | null;
  /** The latest release is being checked: a placeholder stands where "Latest" appears. */
  isCheckingLatest?: boolean;
  /** Extra label and value pairs for the line under the title, for example what a runtime bundles. */
  details?: { label: string; value: string }[];
  releaseUrl?: string;
  /** Progress, a status line or an error, shown under the row. */
  notice?: ReactNode;
  /** The one main button (Install, Update, Open releases page), shown beside the menu. */
  primaryAction?: ReactNode;
  /** The "…" menu entries after Release notes, for example Uninstall. */
  menuItems?: RuntimeMenuItem[];
  /** Disables the menu while an operation runs. */
  isBusy?: boolean;
}

/** The "Latest" part of the summary: a placeholder while it is checked, the version, or nothing. */
function latestPart(latestVersion: string | null, isChecking: boolean): ReactNode {
  if (isChecking) {
    return (
      <span className="runtime-panel__latest-placeholder">
        <SkeletonBlock height={12} />
      </span>
    );
  }
  return latestVersion ? `Latest ${latestVersion}` : null;
}

/**
 * The template every card in Settings > Runtimes uses, laid out like Windows' installed apps list: an
 * icon, the name with a one-line summary, the main button on the right and a "…" menu.
 */
export default function RuntimePanel({
  title,
  icon,
  repo,
  installedVersion,
  latestVersion,
  isCheckingLatest = false,
  details = [],
  releaseUrl,
  notice,
  primaryAction,
  menuItems = [],
  isBusy = false,
}: RuntimePanelProps) {
  const summary: SummaryPart[] = [
    {
      key: "installed",
      node: installedVersion ? `Installed ${installedVersion}` : "Not installed",
    },
    { key: "latest", node: latestPart(latestVersion, isCheckingLatest) },
    ...details.map((detail) => ({ key: detail.label, node: `${detail.label} ${detail.value}` })),
    { key: "repo", node: repo },
  ].filter((part) => part.node !== null);

  return (
    <Card size="small">
      <Flex direction="column" gap="xs">
        <Flex align="center" gap="m">
          <span className="runtime-panel__icon" aria-hidden="true">
            {icon}
          </span>
          <Flex direction="column" className="flex-grow runtime-panel__text">
            <CardTitle>{title}</CardTitle>
            <Meta>
              {summary.map((part, index) => (
                <Fragment key={part.key}>
                  {index > 0 && "  |  "}
                  {part.node}
                </Fragment>
              ))}
            </Meta>
          </Flex>
          {primaryAction}
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button
                appearance="subtle"
                icon={<MoreHorizontalRegular />}
                aria-label={`More options for ${title}`}
                disabled={isBusy}
              />
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {releaseUrl && (
                  <MenuItem
                    onClick={() => openExternal(releaseUrl).catch((err) => console.error(err))}
                  >
                    Release notes
                  </MenuItem>
                )}
                {menuItems.map((item) => (
                  <MenuItem key={item.label} onClick={item.onClick} disabled={item.disabled}>
                    {item.label}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
        </Flex>
        {notice}
      </Flex>
    </Card>
  );
}

import type { BadgeProps } from "@fluentui/react-components";
import { Badge } from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ArrowImportRegular,
  CheckmarkRegular,
  PauseRegular,
  WarningRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import type { DownloadStatus } from "../../stores/downloadStore";

const CONFIG: Record<
  DownloadStatus,
  { icon: ReactElement; color: NonNullable<BadgeProps["color"]>; label: string }
> = {
  downloading: { icon: <ArrowDownloadRegular />, color: "brand", label: "Downloading" },
  importing: { icon: <ArrowImportRegular />, color: "informative", label: "Importing" },
  finished: { icon: <CheckmarkRegular />, color: "success", label: "Finished" },
  error: { icon: <WarningRegular />, color: "danger", label: "Error" },
  cancelled: { icon: <PauseRegular />, color: "subtle", label: "Cancelled" },
};

interface DownloadStatusBadgeProps {
  status: DownloadStatus;
  importingProgress?: string;
}

/** Colored status pill for a download entry. */
export function DownloadStatusBadge({ status, importingProgress }: DownloadStatusBadgeProps) {
  const config = CONFIG[status];
  const label = status === "importing" && importingProgress ? importingProgress : config.label;
  return (
    <Badge appearance="tint" color={config.color} icon={config.icon}>
      {label}
    </Badge>
  );
}

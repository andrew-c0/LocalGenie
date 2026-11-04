import type { BadgeProps } from "@fluentui/react-components";
import { Badge } from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ArrowImportRegular,
  CheckmarkRegular,
  ClockRegular,
  PauseRegular,
  WarningRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import type { DownloadStatus } from "../../../stores/downloadStore";

const CONFIG: Record<
  DownloadStatus,
  { icon: ReactElement; color: NonNullable<BadgeProps["color"]>; label: string }
> = {
  queued: { icon: <ClockRegular />, color: "informative", label: "Queued" },
  downloading: { icon: <ArrowDownloadRegular />, color: "brand", label: "Downloading" },
  importing: { icon: <ArrowImportRegular />, color: "informative", label: "Importing" },
  finished: { icon: <CheckmarkRegular />, color: "success", label: "Finished" },
  error: { icon: <WarningRegular />, color: "danger", label: "Error" },
  // A cancel keeps the partial files, so the entry resumes from them: it reads as paused, with Resume.
  cancelled: { icon: <PauseRegular />, color: "subtle", label: "Paused" },
};

/** The pill's text. A runtime's import step reads as installing; a step message wins over that. */
function labelFor(status: DownloadStatus, isRuntime: boolean, importingProgress?: string): string {
  if (status !== "importing") return CONFIG[status].label;
  if (importingProgress) return importingProgress;
  return isRuntime ? "Installing" : CONFIG.importing.label;
}

interface DownloadStatusBadgeProps {
  status: DownloadStatus;
  /** True for a runtime entry, which changes the import wording. False for model downloads. */
  isRuntime?: boolean;
  importingProgress?: string;
}

/** Colored status pill for a download entry. */
export function DownloadStatusBadge({
  status,
  isRuntime = false,
  importingProgress,
}: DownloadStatusBadgeProps) {
  const config = CONFIG[status];
  return (
    <Badge appearance="tint" color={config.color} icon={config.icon}>
      {labelFor(status, isRuntime, importingProgress)}
    </Badge>
  );
}

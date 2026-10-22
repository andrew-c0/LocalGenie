import type { BadgeProps } from "@fluentui/react-components";
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Divider,
  makeStyles,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Spinner,
  Text,
  Tooltip,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, ChatRegular, ChevronDownRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { precisionInfo, type RamFit } from "../../services/hubApi";
import type { GGUFGroup } from "../../services/hubModels";
import { variantLabel } from "../../services/hubModels";
import { formatBytes } from "../../utils/format";

type BadgeColor = NonNullable<BadgeProps["color"]>;

/** Quantization width → badge colour (lower bits = more compressed). */
const bitsBadgeColor = (bits: number): BadgeColor =>
  bits <= 4 ? "success" : bits <= 6 ? "warning" : bits <= 8 ? "informative" : "important";

const FIT_COPY: Record<RamFit["level"], { badge: BadgeColor; title: string }> = {
  fits: {
    badge: "success",
    title: "This model is likely to fit in your machine's memory.",
  },
  tight: {
    badge: "warning",
    title: "This model may fit, but memory will be tight.",
  },
  no: {
    badge: "danger",
    title: "This model is unlikely to fit in your machine's memory.",
  },
};

const useStyles = makeStyles({
  trigger: {
    width: "100%",
    justifyContent: "space-between",
  },
  surface: {
    display: "flex",
    flexDirection: "column",
    maxHeight: "60vh",
    padding: 0,
    overflow: "hidden",
  },
  surfaceHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    margin: 0,
    border: "none",
    minWidth: 0,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  identity: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    flex: "1 1 240px",
    minWidth: 0,
  },
  filename: {
    flex: "1 1 160px",
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  fit: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  size: {
    minWidth: "72px",
    textAlign: "right",
  },
  action: {
    minWidth: "132px",
  },
  // Download stays invisible until its row is hovered; keyboard focus still shows it.
  hidden: {
    opacity: 0,
    ":focus-visible": {
      opacity: 1,
    },
  },
  revealed: {
    opacity: 1,
  },
  tooltipBody: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    maxWidth: "320px",
  },
});

interface GGUFVariantListProps {
  groups: GGUFGroup[];
  /** Precisions already imported for this repo. */
  downloadedPrecisions: Set<string>;
  /** RAM fit for a variant, or null when memory info is unavailable. */
  fitFor: (group: GGUFGroup) => RamFit | null;
  /** Filename of the variant being downloaded for this repo, if any. */
  activeFilename: string | null;
  /** True while this repo has a download in progress. */
  busy: boolean;
  onDownload: (group: GGUFGroup) => void;
  onLoad: () => void;
}

/** Dropdown of GGUF quantizations: one button opens a panel with a row per file (fit, size, action). */
export function GGUFVariantList({
  groups,
  downloadedPrecisions,
  fitFor,
  activeFilename,
  busy,
  onDownload,
  onLoad,
}: GGUFVariantListProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  /** Row whose Download button is revealed: hovered or holding keyboard focus. */
  const [revealed, setRevealed] = useState<string | null>(null);

  return (
    <Popover
      open={open}
      onOpenChange={(_, data) => setOpen(data.open)}
      positioning={{ position: "below", align: "start", matchTargetSize: "width" }}
    >
      <PopoverTrigger disableButtonEnhancement>
        <Button
          appearance="secondary"
          className={styles.trigger}
          icon={<ChevronDownRegular />}
          iconPosition="after"
          aria-label="Download options"
        >
          Download options ({groups.length})
        </Button>
      </PopoverTrigger>

      <PopoverSurface className={styles.surface} aria-label="Download options">
        <div className={styles.surfaceHeader}>
          <Text weight="semibold" size={400}>
            Choose a download option
          </Text>
          <Caption1>
            {groups.length} {groups.length === 1 ? "file" : "files"}
          </Caption1>
        </div>
        <Divider />

        <div className={styles.list}>
          {groups.map((group) => {
            const info = precisionInfo(group.main.precision);
            const downloaded = downloadedPrecisions.has(group.main.precision ?? "");
            const downloading = activeFilename === group.main.filename;
            const fit = fitFor(group);
            const hasSidecar = group.sidecars.length > 0;

            return (
              <div key={group.main.filename}>
                <fieldset
                  aria-label={group.main.filename}
                  className={styles.row}
                  onMouseEnter={() => setRevealed(group.main.filename)}
                  onMouseLeave={() => setRevealed(null)}
                >
                  <div className={styles.identity}>
                    <Badge appearance="outline" color={bitsBadgeColor(info.bitsPerWeight ?? 4)}>
                      {variantLabel(group)}
                    </Badge>
                    {hasSidecar && (
                      <Badge appearance="tint" color="brand" size="small">
                        +{group.sidecars.length} sidecar
                      </Badge>
                    )}
                    <Caption1 title={group.main.filename} className={styles.filename}>
                      {group.main.filename}
                    </Caption1>
                  </div>

                  <div className={styles.fit}>
                    {fit ? (
                      <Tooltip
                        relationship="description"
                        content={
                          <div className={styles.tooltipBody}>
                            <Body1>{FIT_COPY[fit.level].title}</Body1>
                            <Caption1>
                              There may be other factors that prevent it from loading, such as the
                              model's architecture, file integrity, or the memory available on your
                              computer.
                            </Caption1>
                          </div>
                        }
                      >
                        <Badge appearance="tint" color={FIT_COPY[fit.level].badge}>
                          {fit.label}
                        </Badge>
                      </Tooltip>
                    ) : (
                      <Badge appearance="tint" color="subtle">
                        Fit unknown
                      </Badge>
                    )}
                  </div>

                  <Caption1 className={styles.size}>{formatBytes(group.main.size)}</Caption1>

                  <div className={styles.action}>
                    {downloading ? (
                      <Button appearance="secondary" disabled icon={<Spinner size="tiny" />}>
                        Pulling…
                      </Button>
                    ) : downloaded ? (
                      <Button
                        appearance="primary"
                        icon={<ChatRegular />}
                        disabled={busy}
                        onClick={() => {
                          setOpen(false);
                          onLoad();
                        }}
                      >
                        Load & Chat
                      </Button>
                    ) : (
                      <Button
                        appearance="primary"
                        icon={<ArrowDownloadRegular />}
                        disabled={busy}
                        className={
                          revealed === group.main.filename ? styles.revealed : styles.hidden
                        }
                        onClick={() => {
                          setOpen(false);
                          onDownload(group);
                        }}
                      >
                        Download
                      </Button>
                    )}
                  </div>
                </fieldset>
                <Divider />
              </div>
            );
          })}
        </div>
      </PopoverSurface>
    </Popover>
  );
}

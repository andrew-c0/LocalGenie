import type { BadgeProps } from "@fluentui/react-components";
import { Badge, Button, Spinner } from "@fluentui/react-components";
import { ArrowDownloadRegular, ChatRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { precisionInfo, type RamFit } from "../../services/hubApi";
import type { GGUFGroup } from "../../services/hubModels";
import { variantLabel } from "../../services/hubModels";
import { formatBytes } from "../../utils/format";
import { parseGGUFFilename } from "../../utils/gguf";
import { bitsBadgeColor } from "../../utils/quantBadge";
import { Flex } from "../ui/Flex/Flex";
import { OptionDropdown } from "../ui/OptionDropdown/OptionDropdown";
import { Meta } from "../ui/Typography/Typography";

type BadgeColor = NonNullable<BadgeProps["color"]>;

const FIT_BADGE: Record<RamFit["level"], BadgeColor> = {
  fits: "success",
  tight: "warning",
  no: "danger",
};

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

/**
 * Quantization picker for a Hugging Face repo. The dropdown lists each file with its bit width, RAM fit
 * and download state; once chosen, the field shows the variant and its fit, and the action sits below.
 */
export function GGUFVariantList({
  groups,
  downloadedPrecisions,
  fitFor,
  activeFilename,
  busy,
  onDownload,
  onLoad,
}: GGUFVariantListProps) {
  const [chosenFile, setChosenFile] = useState<string | null>(null);
  const selected = groups.find((g) => g.main.filename === chosenFile) ?? groups[0];

  if (!selected) return null;

  const downloaded = downloadedPrecisions.has(selected.main.precision ?? "");
  const downloading = activeFilename === selected.main.filename;

  const options = groups.map((group) => {
    const fit = fitFor(group);
    const isDownloaded = downloadedPrecisions.has(group.main.precision ?? "");
    const bits = precisionInfo(group.main.precision).bitsPerWeight ?? 4;
    const sidecarKinds = [
      ...new Set(group.sidecars.map((s) => parseGGUFFilename(s.filename)?.sidecar).filter(Boolean)),
    ];
    const fitText = fit ? fit.label : "fit unknown";
    return {
      value: group.main.filename,
      label: variantLabel(group),
      selectedLabel: `${variantLabel(group)} · ${fitText}`,
      content: (
        // Fluent's option wrapper shrinks to its content, so the row takes the full width itself.
        <Flex align="center" justify="between" gap="s" wrap style={{ width: "100%" }}>
          <Flex align="center" gap="s" wrap>
            {/* Fixed-width slot so the fit badges line up in one column across rows. */}
            <span style={{ display: "inline-block", minWidth: "7.5rem" }}>
              <Badge appearance="outline" color={bitsBadgeColor(bits)}>
                {group.main.precision}
              </Badge>
            </span>
            {fit ? (
              <Badge appearance="tint" color={FIT_BADGE[fit.level]}>
                {fit.label}
              </Badge>
            ) : (
              <Badge appearance="tint" color="subtle">
                Fit unknown
              </Badge>
            )}
            {isDownloaded && (
              <Badge appearance="tint" color="success" size="small">
                Downloaded
              </Badge>
            )}
          </Flex>
          <Meta>
            {formatBytes(group.main.size)}
            {sidecarKinds.map((kind) => ` · + ${kind}`).join("")}
          </Meta>
        </Flex>
      ),
    };
  });

  const action = downloading ? (
    <Button appearance="secondary" disabled icon={<Spinner size="tiny" />}>
      Pulling…
    </Button>
  ) : downloaded ? (
    <Button appearance="primary" icon={<ChatRegular />} disabled={busy} onClick={onLoad}>
      Load & Chat
    </Button>
  ) : (
    <Button
      appearance="primary"
      icon={<ArrowDownloadRegular />}
      disabled={busy}
      onClick={() => onDownload(selected)}
    >
      Download
    </Button>
  );

  return (
    <Flex direction="column" gap="s" align="stretch">
      <OptionDropdown
        fullWidth
        label="Quantization"
        options={options}
        value={selected.main.filename}
        onChange={setChosenFile}
        disabled={busy}
      />
      <Flex justify="end">{action}</Flex>
    </Flex>
  );
}

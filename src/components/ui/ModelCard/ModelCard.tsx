import type { BadgeProps } from "@fluentui/react-components";
import { Badge, Button, Card, Spinner, Tooltip } from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ChatRegular,
  ClockRegular,
  DeleteRegular,
  DocumentRegular,
  HardDriveRegular,
  HeartRegular,
  InfoRegular,
  NumberSymbolRegular,
  RamRegular,
  ScalesRegular,
  TagRegular,
  TextWordCountRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import type { CardRamVerdict } from "../../../utils/cardRam";
import { formatCount } from "../../../utils/format";
import type { CapabilityBadge } from "../../../utils/modelCapabilities";
import { Flex } from "../Flex/Flex";
import { ModelCapabilityIcons } from "../ModelCapabilityIcons/ModelCapabilityIcons";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import { CardTitle, Meta } from "../Typography/Typography";
import { ModelCardInfoIcon } from "./ModelCardInfoIcon";
import { factTooltipText } from "./modelCardData";
import "./ModelCard.css";

/** The kinds of fact on the second row. Each kind has its own icon and tooltip label. */
export type FactKind = "task" | "params" | "quant" | "ctx" | "licence" | "disk";

/** One fact on the second row. A fact the model does not have is left out, not shown as N/A. */
export interface ModelCardFact {
  kind: FactKind;
  /** The value only; the tooltip names the fact. */
  text: string;
  /** A short note for the tooltip, in brackets after the value (for example "approximate"). */
  note?: string;
}

/** The RAM badge on the second row. Without a `level` it is neutral; with one it is coloured. */
export interface ModelCardRam {
  label: string;
  /** Tooltip text, the RAM fit in words. */
  detail?: string;
  level?: CardRamVerdict["level"];
}

/** The 16px neutral icon that stands for each fact kind. */
const FACT_ICON: Record<FactKind, ReactElement> = {
  task: <TagRegular fontSize={16} />,
  params: <NumberSymbolRegular fontSize={16} />,
  quant: <ScalesRegular fontSize={16} />,
  ctx: <TextWordCountRegular fontSize={16} />,
  licence: <DocumentRegular fontSize={16} />,
  disk: <HardDriveRegular fontSize={16} />,
};

/**
 * What one model card shows. Each tab fills this in its own builder (see `ui/ModelCard/modelCardData`),
 * so the three card types share one layout.
 */
export interface ModelCardData {
  name: string;
  /** Installed on this device: the card offers Load & Chat, Details and Remove. */
  installed: boolean;
  /** Gated on Hugging Face (shows a Gated pill when no other status applies). */
  gated?: boolean;
  /** Status pill after the title. Replaces the Loaded and Gated pills when set. */
  badge?: { tone: "green" | "default"; label: string };
  /** Capability icons, confirmed or inferred, in display order. */
  capabilityBadges: CapabilityBadge[];
  /** Facts on the second row, in order. */
  facts: ModelCardFact[];
  /** RAM badge at the end of the second row. Null or absent shows nothing. */
  ramVerdict?: ModelCardRam | null;
  /** Time since the last update, with the full date for the tooltip. */
  updated?: { relative: string; full: string | null };
  /** Hub downloads and likes. Omitted for a downloaded repo. */
  stats?: { downloads?: number; likes?: number };
  /** Lines of the info tooltip: the description, the source, the languages. */
  details?: string[];
}

const VERDICT_COLOR: Record<CardRamVerdict["level"], BadgeProps["color"]> = {
  fits: "success",
  tight: "warning",
  no: "danger",
};

interface ModelCardProps {
  model: ModelCardData;
  /** Model is loaded on the server. */
  isLoaded: boolean;
  isDownloading: boolean;
  /** Open the header model selector (which loads + binds to the active chat). */
  onOpenSelector?: () => void;
  onRemove?: (name: string) => void;
  /** Open the model's detail page. The caller picks the route for its source. */
  onDetails?: (name: string) => void;
}

/** One model as a row: the content on the left, the actions on the right. */
export function ModelCard({
  model,
  isLoaded,
  isDownloading,
  onOpenSelector,
  onRemove,
  onDetails,
}: ModelCardProps) {
  const openDetails = () => onDetails?.(model.name);
  const { updated, stats, details, ramVerdict } = model;

  const status = model.badge ? (
    <StatusBadge tone={model.badge.tone}>{model.badge.label}</StatusBadge>
  ) : isLoaded ? (
    <StatusBadge tone="green">Loaded</StatusBadge>
  ) : model.gated ? (
    <StatusBadge>Gated</StatusBadge>
  ) : null;

  return (
    <Card size="small" className="model-card">
      <Flex align="center" gap="m">
        <Flex direction="column" gap="xs" grow className="model-card__body">
          <Flex align="center" gap="xs" className="model-card__header">
            <CardTitle truncate wrap={false} title={model.name} className="model-card__title">
              {model.name}
            </CardTitle>
            {status}
            <ModelCapabilityIcons badges={model.capabilityBadges} />
            {updated && (
              <ModelCardInfoIcon
                icon={<ClockRegular fontSize={16} />}
                label={`Updated ${updated.relative}`}
                lines={[`Updated ${updated.relative}`, ...(updated.full ? [updated.full] : [])]}
              />
            )}
            {details && details.length > 0 && (
              <ModelCardInfoIcon
                icon={<InfoRegular fontSize={16} />}
                label="About this model"
                lines={details}
              />
            )}
            {stats && (stats.downloads != null || stats.likes != null) && (
              <Flex align="center" gap="s" className="model-card__stats">
                {stats.downloads != null && (
                  <Flex align="center" gap="xxs" title="Downloads">
                    <ArrowDownloadRegular fontSize={16} />
                    <Meta>{formatCount(stats.downloads)}</Meta>
                  </Flex>
                )}
                {stats.likes != null && (
                  <Flex align="center" gap="xxs" title="Likes">
                    <HeartRegular fontSize={16} />
                    <Meta>{formatCount(stats.likes)}</Meta>
                  </Flex>
                )}
              </Flex>
            )}
          </Flex>

          {(model.facts.length > 0 || ramVerdict) && (
            <Flex align="center" gap="m" className="model-card__facts">
              {model.facts.map((fact) => (
                <Tooltip key={fact.kind} relationship="description" content={factTooltipText(fact)}>
                  <span className="model-card__fact">
                    {FACT_ICON[fact.kind]}
                    <Meta className="model-card__fact-text">{fact.text}</Meta>
                  </span>
                </Tooltip>
              ))}
              {ramVerdict && (
                <Badge
                  appearance="outline"
                  size="small"
                  color={ramVerdict.level ? VERDICT_COLOR[ramVerdict.level] : undefined}
                  icon={<RamRegular />}
                  title={ramVerdict.detail}
                >
                  <span className="model-card__fact-text">{ramVerdict.label}</span>
                </Badge>
              )}
            </Flex>
          )}
        </Flex>

        <Flex align="center" gap="s" className="model-card__actions">
          {isDownloading ? (
            <Button disabled icon={<Spinner size="tiny" />}>
              Pulling…
            </Button>
          ) : model.installed ? (
            <>
              <Button
                appearance="primary"
                icon={<ChatRegular />}
                onClick={onOpenSelector}
                disabled={isLoaded}
              >
                {isLoaded ? "Active" : "Load & Chat"}
              </Button>
              <Button appearance="secondary" icon={<InfoRegular />} onClick={openDetails}>
                Details
              </Button>
              {onRemove && (
                <Button
                  appearance="secondary"
                  icon={<DeleteRegular />}
                  title="Remove model"
                  aria-label={`Remove ${model.name}`}
                  onClick={() => onRemove(model.name)}
                />
              )}
            </>
          ) : (
            <Button appearance="secondary" icon={<InfoRegular />} onClick={openDetails}>
              Details
            </Button>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}

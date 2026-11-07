import { Button, Card, Link } from "@fluentui/react-components";
import {
  DeleteRegular,
  DocumentRegular,
  HardDriveRegular,
  TargetArrowRegular,
  TranslateRegular,
} from "@fluentui/react-icons";
import type { MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { usePlaygroundDownload } from "../../../../hooks/usePlaygroundDownload";
import { downloadButtonLabelOf } from "../../../../utils/modelRecommendations";
import { playgroundModelPathOf } from "../../../../utils/playgroundModelDetail";
import type { CatalogModelRow } from "../../../../utils/playgroundModelsCatalog";
import { downloadCatalogModel } from "../../../playground/playgroundSelection";
import { ExternalLink } from "../../../ui/ExternalLink/ExternalLink";
import { Flex } from "../../../ui/Flex/Flex";
import { StatusBadge } from "../../../ui/StatusBadge/StatusBadge";
import { BodyStrong, Meta } from "../../../ui/Typography/Typography";
import "./PlaygroundCatalogRow.css";

interface PlaygroundCatalogRowProps {
  row: CatalogModelRow;
  /** This model's delete is running. Delete is off meanwhile. */
  isDeleteBusy: boolean;
  /** Another Playground download is running. Downloads run one at a time. */
  isAnyDownloading: boolean;
  onDelete: (modelId: string) => void;
}

/** One fact of the row: an icon and its text on the muted line. */
function fact(icon: ReactNode, text: ReactNode) {
  return (
    <Flex align="center" gap="xs">
      <span className="playground-catalog-row__icon" aria-hidden="true">
        {icon}
      </span>
      {text}
    </Flex>
  );
}

/**
 * One curated Playground model: its name and state, a one-line description, and its facts. An installed
 * model can be deleted here; one not yet installed downloads from here, and its progress is in the drawer.
 */
export function PlaygroundCatalogRow({
  row,
  isDeleteBusy,
  isAnyDownloading,
  onDelete,
}: PlaygroundCatalogRowProps) {
  const navigate = useNavigate();
  const download = usePlaygroundDownload(row.id);
  const isDownloading = download?.status === "downloading";
  const detailPath = playgroundModelPathOf(row.group, row.id);

  const openDetail = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigate(detailPath);
  };

  return (
    <Card size="small">
      <Flex align="center" gap="m">
        <Flex direction="column" gap="xxs" grow>
          <Flex align="center" gap="s">
            <Link href={detailPath} title={row.name} onClick={openDetail}>
              <BodyStrong>{row.name}</BodyStrong>
            </Link>
            {row.installed && <StatusBadge tone="green">Installed</StatusBadge>}
            {!row.installed && isDownloading && <StatusBadge tone="blue">Downloading</StatusBadge>}
          </Flex>
          <Meta truncate title={row.description}>
            {row.description}
          </Meta>
          <Flex align="center" gap="m" wrap>
            {fact(<HardDriveRegular />, <Meta>{row.sizeLabel}</Meta>)}
            {row.license &&
              fact(
                <DocumentRegular />,
                row.licenseUrl ? (
                  <ExternalLink url={row.licenseUrl}>{row.license}</ExternalLink>
                ) : (
                  <Meta>{row.license}</Meta>
                ),
              )}
            {row.languagesLabel && fact(<TranslateRegular />, <Meta>{row.languagesLabel}</Meta>)}
            {row.bestFor && fact(<TargetArrowRegular />, <Meta>{row.bestFor}</Meta>)}
          </Flex>
        </Flex>
        {row.installed ? (
          <Button
            appearance="secondary"
            icon={<DeleteRegular />}
            disabled={isDeleteBusy}
            onClick={() => onDelete(row.id)}
          >
            Delete
          </Button>
        ) : (
          <Button
            appearance="secondary"
            disabled={isDownloading || isAnyDownloading}
            onClick={() => downloadCatalogModel(row.catalog, row)}
          >
            {downloadButtonLabelOf(download)}
          </Button>
        )}
      </Flex>
    </Card>
  );
}

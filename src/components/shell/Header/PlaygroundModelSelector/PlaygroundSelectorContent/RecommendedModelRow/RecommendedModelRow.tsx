import { Button } from "@fluentui/react-components";
import { usePlaygroundDownload } from "../../../../../../hooks/usePlaygroundDownload";
import { downloadButtonLabelOf } from "../../../../../../utils/modelRecommendations";
import type { SelectorRow } from "../../../../../../utils/playgroundSelector";
import { downloadCatalogModel } from "../../../../../playground/playgroundSelection";
import { Flex } from "../../../../../ui/Flex/Flex";
import { BodyStrong, Meta } from "../../../../../ui/Typography/Typography";
import "./RecommendedModelRow.css";

interface RecommendedModelRowProps {
  row: SelectorRow;
  /** Another Playground download is running. Downloads run one at a time. */
  isOtherDownloading: boolean;
}

/**
 * A catalog model that is not downloaded yet. Its Download button is the only state shown: it reads
 * Downloading (no percentage) while the model downloads. Progress, cancel and retry are in the
 * Downloads drawer.
 */
export function RecommendedModelRow({ row, isOtherDownloading }: RecommendedModelRowProps) {
  const download = usePlaygroundDownload(row.model.id);
  const isDownloading = download?.status === "downloading";

  return (
    <div className="recommended-model-row">
      <Flex align="center" justify="between" gap="s">
        <Flex direction="column" gap="xxs" grow className="recommended-model-row__text">
          <BodyStrong as="span" truncate title={row.model.name}>
            {row.model.name}
          </BodyStrong>
          {row.model.detail && (
            <Meta as="span" truncate>
              {row.model.detail}
            </Meta>
          )}
        </Flex>
        <Button
          appearance="primary"
          disabled={isDownloading || isOtherDownloading}
          onClick={() => downloadCatalogModel(row.catalog, row.model)}
        >
          {downloadButtonLabelOf(download)}
        </Button>
      </Flex>
    </div>
  );
}

import { Button } from "@fluentui/react-components";
import { ArrowDownloadRegular } from "@fluentui/react-icons";
import { Flex } from "../../../components/ui/Flex/Flex";
import { Meta } from "../../../components/ui/Typography/Typography";
import type { AihubAsset, AihubModelDetail } from "../../../services/aihub";
import { isDownloadActive, useDownloadStore } from "../../../stores/downloadStore";
import { aihubFacets, aihubFolder, aihubModelName, aihubZipName } from "../../../utils/aihub";

interface Props {
  model: AihubModelDetail;
  asset: AihubAsset;
}

/** One QAIRT asset of a model, with a Download button that queues the zip and its import. */
export function AihubAssetRow({ model, asset }: Props) {
  const modelName = aihubModelName(model.name);
  const active = useDownloadStore((s) =>
    isDownloadActive(s.downloads.find((d) => d.id === modelName)?.status),
  );
  const enqueueAihub = useDownloadStore((s) => s.enqueueAihub);

  const handleDownload = () =>
    enqueueAihub({
      modelName,
      downloadUrl: asset.downloadUrl,
      folder: aihubFolder(model.id),
      zipName: aihubZipName(model.id, asset.precision, asset.chipset),
      precision: asset.precision,
      facets: aihubFacets(asset.precision),
    });

  return (
    <Flex gap="s" align="center" justify="between">
      <Meta>{asset.chipset ?? "Any chipset"}</Meta>
      <Button
        appearance="secondary"
        size="small"
        icon={<ArrowDownloadRegular />}
        disabled={active}
        onClick={handleDownload}
      >
        Download
      </Button>
    </Flex>
  );
}

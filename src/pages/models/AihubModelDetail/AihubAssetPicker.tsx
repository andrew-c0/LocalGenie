import { Badge, Button, Spinner } from "@fluentui/react-components";
import { ArrowDownloadRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { Flex } from "../../../components/ui/Flex/Flex";
import { OptionDropdown } from "../../../components/ui/OptionDropdown/OptionDropdown";
import { Meta } from "../../../components/ui/Typography/Typography";
import type { AihubAsset, AihubModelDetail } from "../../../services/aihub";
import { isDownloadActive, useDownloadStore } from "../../../stores/downloadStore";
import { useModelStore } from "../../../stores/modelStore";
import {
  aihubFacets,
  aihubFolder,
  aihubModelName,
  aihubZipName,
  hfFileOf,
  isAssetForDevice,
} from "../../../utils/aihub";
import { parseGGUFFilename } from "../../../utils/gguf";

interface Props {
  model: AihubModelDetail;
  assets: AihubAsset[];
}

/**
 * Identity of one row. AI Hub can list one zip under two chipsets, so the URL alone is not unique.
 */
function assetKey(asset: AihubAsset): string {
  return `${asset.chipset ?? ""}|${asset.downloadUrl}`;
}

/** Whether an asset is universal, for this device, or for another chipset. */
function DeviceMatchBadge({
  chipset,
  deviceChipset,
}: {
  chipset: string | null;
  deviceChipset: string | null;
}) {
  if (chipset === null) {
    return (
      <Badge appearance="tint" color="subtle">
        Any chipset
      </Badge>
    );
  }
  return isAssetForDevice(chipset, deviceChipset) ? (
    <Badge appearance="tint" color="success">
      This device
    </Badge>
  ) : (
    <Badge appearance="tint" color="subtle">
      Other chipset
    </Badge>
  );
}

/**
 * The runnable assets of a model as a dropdown, like the Hugging Face quantization picker. Each row
 * shows its precision, its chipset and whether it is for this device. The device's own asset is picked
 * first. An asset for another chipset cannot be downloaded: the backend refuses it, so the button is
 * disabled. A zip is an AI Hub download; a GGUF file is downloaded from its Hugging Face repo.
 */
export function AihubAssetPicker({ model, assets }: Props) {
  const deviceChipset = useModelStore((s) => s.chipset);
  const modelName = aihubModelName(model.name);
  const downloads = useDownloadStore((s) => s.downloads);
  const enqueueAihub = useDownloadStore((s) => s.enqueueAihub);
  const enqueueGGUF = useDownloadStore((s) => s.enqueue);
  const [chosenKey, setChosenKey] = useState<string | null>(null);

  const selected =
    assets.find((a) => assetKey(a) === chosenKey) ??
    assets.find((a) => isAssetForDevice(a.chipset, deviceChipset)) ??
    assets[0];
  if (!selected) return null;

  const gguf = hfFileOf(selected.downloadUrl);
  const downloadId = gguf?.repoId ?? modelName;
  const busy = downloads.some((d) => d.id === downloadId && isDownloadActive(d.status));
  const allowed = isAssetForDevice(selected.chipset, deviceChipset);

  const options = assets.map((asset) => ({
    value: assetKey(asset),
    label: `${asset.precision} · ${asset.chipset ?? "Any chipset"}`,
    content: (
      // Fluent's option wrapper shrinks to its content, so the row takes the full width itself.
      <Flex align="center" justify="between" gap="s" wrap style={{ width: "100%" }}>
        <Flex align="center" gap="s" wrap>
          <Badge appearance="outline">{asset.precision}</Badge>
          <Meta>{asset.chipset ?? "Any chipset"}</Meta>
        </Flex>
        <DeviceMatchBadge chipset={asset.chipset} deviceChipset={deviceChipset} />
      </Flex>
    ),
  }));

  const handleDownload = () => {
    if (gguf) {
      const parsed = parseGGUFFilename(gguf.filename);
      enqueueGGUF({
        repoId: gguf.repoId,
        main: {
          filename: gguf.filename,
          precision: parsed?.encoding ?? selected.precision,
          sizeLabel: parsed?.sizeLabel ?? null,
          shard: null,
        },
        sidecars: [],
      });
      return;
    }
    enqueueAihub({
      modelName,
      downloadUrl: selected.downloadUrl,
      folder: aihubFolder(model.id),
      zipName: aihubZipName(model.id, selected.precision, selected.chipset),
      precision: selected.precision,
      facets: aihubFacets(selected.precision),
    });
  };

  return (
    <Flex direction="column" gap="s" align="stretch">
      <OptionDropdown
        fullWidth
        label="Asset"
        options={options}
        value={assetKey(selected)}
        onChange={setChosenKey}
        disabled={busy}
      />
      {!allowed && (
        <Meta>
          This asset is for {selected.chipset}, and this device is{" "}
          {deviceChipset ?? "not set to a chipset"}.
        </Meta>
      )}
      <Flex justify="end">
        <Button
          appearance="primary"
          icon={busy ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
          disabled={busy || !allowed}
          onClick={handleDownload}
        >
          {busy ? "Pulling…" : "Download"}
        </Button>
      </Flex>
    </Flex>
  );
}

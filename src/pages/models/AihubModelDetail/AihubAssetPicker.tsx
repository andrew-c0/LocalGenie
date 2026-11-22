import { Badge, Button, Spinner } from "@fluentui/react-components";
import { ArrowDownloadRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { Flex } from "../../../components/ui/Flex/Flex";
import { OptionDropdown } from "../../../components/ui/OptionDropdown/OptionDropdown";
import { Meta } from "../../../components/ui/Typography/Typography";
import { useCliLock } from "../../../hooks/useCliLock";
import type { AihubAsset, AihubModelDetail } from "../../../services/aihub";
import { isDownloadActive, useDownloadStore } from "../../../stores/downloadStore";
import { useModelStore } from "../../../stores/modelStore";
import {
  aihubFacets,
  aihubFolder,
  aihubModelName,
  aihubZipName,
  chipsetUnknownHint,
  deviceMatchLabel,
  hfFileOf,
  isAssetForDevice,
} from "../../../utils/aihub";
import { parseGGUFFilename } from "../../../utils/gguf";
import { useDownloadedPrecisions } from "../useHubModelDetail";

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

/** The precision an asset is stored under once imported: a GGUF file's encoding, else the asset's own. */
function precisionOf(asset: AihubAsset): string {
  const gguf = hfFileOf(asset.downloadUrl);
  return (gguf && parseGGUFFilename(gguf.filename)?.encoding) || asset.precision;
}

/** Whether an asset is universal, for this device, for another chipset, or the device is not known. */
function DeviceMatchBadge({
  chipset,
  deviceChipset,
  cliInstalled,
}: {
  chipset: string | null;
  deviceChipset: string | null;
  cliInstalled: boolean | null;
}) {
  const label = deviceMatchLabel(chipset, deviceChipset);
  return (
    <Badge
      appearance="tint"
      color={label === "This device" ? "success" : "subtle"}
      title={label === "Device unknown" ? chipsetUnknownHint(cliInstalled) : undefined}
    >
      {label}
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
  const cliInstalled = useModelStore((s) => s.cliInstalled);
  const modelName = aihubModelName(model.name);
  const downloads = useDownloadStore((s) => s.downloads);
  const enqueueAihub = useDownloadStore((s) => s.enqueueAihub);
  const enqueueGGUF = useDownloadStore((s) => s.enqueue);
  /** A download imports into GenieX, so it waits for the CLI. Its reason is shown under the field. */
  const cliLock = useCliLock();
  const [chosenKey, setChosenKey] = useState<string | null>(null);

  const selected =
    assets.find((a) => assetKey(a) === chosenKey) ??
    assets.find((a) => isAssetForDevice(a.chipset, deviceChipset)) ??
    assets[0];
  // Called for every render, so before the early return: the precisions already imported for this
  // asset's repo (the Hugging Face repo of a GGUF asset, else the AI Hub model).
  const downloadedPrecisions = useDownloadedPrecisions(
    (selected && hfFileOf(selected.downloadUrl)?.repoId) || modelName,
  );
  if (!selected) return null;

  const gguf = hfFileOf(selected.downloadUrl);
  const downloadId = gguf?.repoId ?? modelName;
  const busy = downloads.some((d) => d.id === downloadId && isDownloadActive(d.status));
  const allowed = isAssetForDevice(selected.chipset, deviceChipset);
  const downloaded = downloadedPrecisions.has(precisionOf(selected));

  const options = assets.map((asset) => ({
    value: assetKey(asset),
    label: `${asset.precision} · ${asset.chipset ?? "Any chipset"}`,
    content: (
      // Fluent's option wrapper shrinks to its content, so the row takes the full width itself.
      <Flex align="center" justify="between" gap="s" wrap style={{ width: "100%" }}>
        <Flex align="center" gap="s" wrap>
          <Badge appearance="outline">{asset.precision}</Badge>
          <Meta>{asset.chipset ?? "Any chipset"}</Meta>
          {downloadedPrecisions.has(precisionOf(asset)) && (
            <Badge appearance="tint" color="success" size="small">
              Downloaded
            </Badge>
          )}
        </Flex>
        <DeviceMatchBadge
          chipset={asset.chipset}
          deviceChipset={deviceChipset}
          cliInstalled={cliInstalled}
        />
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
          {deviceChipset
            ? `This asset is for ${selected.chipset}, and this device is ${deviceChipset}.`
            : `This asset is for ${selected.chipset}. ${chipsetUnknownHint(cliInstalled)}`}
        </Meta>
      )}
      <Flex justify="end" align="center" gap="s" wrap>
        {cliLock && <Meta>{cliLock}</Meta>}
        <Button
          appearance="primary"
          icon={busy ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
          disabled={busy || !allowed || downloaded || cliLock !== null}
          onClick={handleDownload}
        >
          {busy ? "Pulling…" : downloaded ? "Downloaded" : "Download"}
        </Button>
      </Flex>
    </Flex>
  );
}

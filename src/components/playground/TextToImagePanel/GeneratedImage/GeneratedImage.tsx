import { Button, Spinner } from "@fluentui/react-components";
import { readImage, revealImage } from "../../../../services/playground";
import type { ImageResult, PlaygroundDevice } from "../../../../types";
import { errorMessage } from "../../../../utils/errorMessage";
import { formatDuration } from "../../../../utils/format";
import { deviceSummaryLabel } from "../../../../utils/playground";
import { toast } from "../../../../utils/toast";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../ui/Flex/Flex";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Body, Meta } from "../../../ui/Typography/Typography";
import { useSavedDataUrl } from "../../useSavedDataUrl";
import "./GeneratedImage.css";

interface GeneratedImageProps {
  result: ImageResult;
  /** Names the device the result ran on. Null until the devices have been read. */
  devices: PlaygroundDevice[] | null;
  /** Fill the form seed with this result's seed and turn random seeds off. */
  onUseSeed: (seed: number) => void;
}

/** The last generation: the image with its save location, time and seed, or the reason it has none. */
export default function GeneratedImage({ result, devices, onUseSeed }: GeneratedImageProps) {
  const path = result.status === "done" ? result.path : null;
  const seed = result.seed;
  const image = useSavedDataUrl(path, readImage, "Could not open the image.");

  const reveal = () => {
    if (!path) return;
    revealImage(path).catch((err: unknown) => {
      toast.error("Could not open the folder", errorMessage(err));
    });
  };

  if (result.status === "error") {
    return (
      <SurfaceCard title="Result">
        <ErrorBanner message={result.error ?? "The image could not be generated."} />
      </SurfaceCard>
    );
  }
  if (result.status === "cancelled") {
    return (
      <SurfaceCard title="Result">
        <Body>Generation cancelled.</Body>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard
      title="Result"
      action={
        path ? (
          <Button appearance="secondary" onClick={reveal}>
            Show in folder
          </Button>
        ) : undefined
      }
    >
      <Flex direction="column" gap="s">
        {!path && <ErrorBanner message="The image was not saved." />}
        {image.error && <ErrorBanner message={image.error} />}
        {path && !image.error && !image.dataUrl && <Spinner label="Opening the image…" />}
        {image.dataUrl && (
          <img className="generated-image__image" src={image.dataUrl} alt="Generated output" />
        )}
        {result.seconds !== null && (
          <Meta>Generated in {formatDuration(result.seconds * 1000)}</Meta>
        )}
        <Meta>Computed on {deviceSummaryLabel(result.device, devices ?? [])}</Meta>
        {seed !== null && (
          <Flex gap="m" align="center" justify="between" wrap>
            <Meta>Seed {seed}</Meta>
            <Button appearance="secondary" onClick={() => onUseSeed(seed)}>
              Use this seed
            </Button>
          </Flex>
        )}
        {path && <Meta className="generated-image__path">Saved to {path}</Meta>}
      </Flex>
    </SurfaceCard>
  );
}

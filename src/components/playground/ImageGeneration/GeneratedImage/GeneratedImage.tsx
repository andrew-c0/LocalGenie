import { Button } from "@fluentui/react-components";
import { readImage, readInputImage, revealImage } from "../../../../services/playground";
import type { ImageResult, PlaygroundDevice } from "../../../../types";
import { errorMessage } from "../../../../utils/errorMessage";
import { formatDuration } from "../../../../utils/format";
import { USE_AS_INPUT_LABEL } from "../../../../utils/imageToImageText";
import { deviceSummaryLabel } from "../../../../utils/playground";
import { toast } from "../../../../utils/toast";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../ui/Flex/Flex";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Body, Meta } from "../../../ui/Typography/Typography";
import { useSavedDataUrl } from "../../useSavedDataUrl";
import { ImagePane } from "./ImagePane/ImagePane";
import "./GeneratedImage.css";

interface GeneratedImageProps {
  result: ImageResult;
  /** Names the device the result ran on. Null until the devices have been read. */
  devices: PlaygroundDevice[] | null;
  /** Fill the form seed with this result's seed and turn random seeds off. */
  onUseSeed: (seed: number) => void;
  /** Use this result's saved picture as the input of image to image. Left out where that does not apply. */
  onUseAsInput?: (path: string) => void;
}

/**
 * The last generation: the image with its save location, time and seed, or the reason it has none.
 * An image to image result shows its input picture beside the new one.
 */
export default function GeneratedImage({
  result,
  devices,
  onUseSeed,
  onUseAsInput,
}: GeneratedImageProps) {
  const path = result.status === "done" ? result.path : null;
  const seed = result.seed;
  const output = useSavedDataUrl(path, readImage, "Could not open the image.");
  const input = useSavedDataUrl(
    result.inputPath,
    readInputImage,
    "Could not open the input image.",
  );

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
          <Flex gap="s" wrap>
            {onUseAsInput && (
              <Button appearance="secondary" onClick={() => onUseAsInput(path)}>
                {USE_AS_INPUT_LABEL}
              </Button>
            )}
            <Button appearance="secondary" onClick={reveal}>
              Show in folder
            </Button>
          </Flex>
        ) : undefined
      }
    >
      <Flex direction="column" gap="s">
        {!path && <ErrorBanner message="The image was not saved." />}
        <Flex gap="m" wrap align="start">
          {result.inputPath && (
            <ImagePane
              label="Input"
              alt="Input image"
              dataUrl={input.dataUrl}
              error={input.error}
              isLoading={!input.error && !input.dataUrl}
            />
          )}
          {path && (
            <ImagePane
              label={result.inputPath ? "Result" : undefined}
              alt="Generated output"
              dataUrl={output.dataUrl}
              error={output.error}
              isLoading={!output.error && !output.dataUrl}
            />
          )}
        </Flex>
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

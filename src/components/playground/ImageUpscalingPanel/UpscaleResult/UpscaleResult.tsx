import { Button } from "@fluentui/react-components";
import { readImage, readInputImage, revealImage } from "../../../../services/playground";
import type { ImageResult } from "../../../../types";
import { errorMessage } from "../../../../utils/errorMessage";
import { formatDuration } from "../../../../utils/format";
import { toast } from "../../../../utils/toast";
import {
  UPSCALE_AFTER_LABEL,
  UPSCALE_BEFORE_LABEL,
  UPSCALE_CANCELLED_MESSAGE,
  UPSCALE_FAILED_MESSAGE,
  UPSCALE_NOT_SAVED_MESSAGE,
  UPSCALE_RESULT_TITLE,
} from "../../../../utils/upscaleText";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../ui/Flex/Flex";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Body, Meta } from "../../../ui/Typography/Typography";
import { ImagePane } from "../../ImageGeneration/GeneratedImage/ImagePane/ImagePane";
import { useSavedDataUrl } from "../../useSavedDataUrl";
import "./UpscaleResult.css";

interface UpscaleResultProps {
  result: ImageResult;
}

/** The last upscale: the input and the upscaled picture side by side, with Show in folder, or the reason there is none. */
export function UpscaleResult({ result }: UpscaleResultProps) {
  const path = result.status === "done" ? result.path : null;
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
      <SurfaceCard title={UPSCALE_RESULT_TITLE}>
        <ErrorBanner message={result.error ?? UPSCALE_FAILED_MESSAGE} />
      </SurfaceCard>
    );
  }
  if (result.status === "cancelled") {
    return (
      <SurfaceCard title={UPSCALE_RESULT_TITLE}>
        <Body>{UPSCALE_CANCELLED_MESSAGE}</Body>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard
      title={UPSCALE_RESULT_TITLE}
      action={
        path ? (
          <Button appearance="secondary" onClick={reveal}>
            Show in folder
          </Button>
        ) : undefined
      }
    >
      <Flex direction="column" gap="s">
        {!path && <ErrorBanner message={UPSCALE_NOT_SAVED_MESSAGE} />}
        <Flex gap="m" wrap align="start">
          {result.inputPath && (
            <ImagePane
              label={UPSCALE_BEFORE_LABEL}
              alt="Input image"
              dataUrl={input.dataUrl}
              error={input.error}
              isLoading={!input.error && !input.dataUrl}
            />
          )}
          {path && (
            <ImagePane
              label={UPSCALE_AFTER_LABEL}
              alt="Upscaled image"
              dataUrl={output.dataUrl}
              error={output.error}
              isLoading={!output.error && !output.dataUrl}
            />
          )}
        </Flex>
        {result.seconds !== null && (
          <Meta>Upscaled in {formatDuration(result.seconds * 1000)}</Meta>
        )}
        {path && <Meta className="upscale-result__path">Saved to {path}</Meta>}
      </Flex>
    </SurfaceCard>
  );
}

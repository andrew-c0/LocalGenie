import type { ReactElement } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AudioToAudioPanel from "../../components/playground/AudioToAudioPanel/AudioToAudioPanel";
import ImageToImagePanel from "../../components/playground/ImageToImagePanel/ImageToImagePanel";
import ImageUpscalingPanel from "../../components/playground/ImageUpscalingPanel/ImageUpscalingPanel";
import OcrPanel from "../../components/playground/OcrPanel/OcrPanel";
import SpeechToTextPanel from "../../components/playground/SpeechToTextPanel/SpeechToTextPanel";
import TextToImagePanel from "../../components/playground/TextToImagePanel/TextToImagePanel";
import TextToSpeechPanel from "../../components/playground/TextToSpeechPanel/TextToSpeechPanel";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { useRuntimeLocks } from "../../hooks/useRuntimeLocks";
import { routeById } from "../../navigation/routeUtils";
import "./PlaygroundSectionPage.css";

/** The Playground tools, by route id. Each route in `Navigation.tsx` names one of them. */
export type PlaygroundRouteId =
  | "playground-text-to-image"
  | "playground-image-to-image"
  | "playground-image-upscaling"
  | "playground-ocr"
  | "playground-speech-to-text"
  | "playground-text-to-speech"
  | "playground-audio-to-audio";

interface ToolPanel {
  /** The panel shows its own notice when its runtime is missing. Without one, a locked tool goes back to the landing. */
  ownsRuntimeNotice: boolean;
  /** Renders the tool's panel. `openImageToImage` is only used by text to image. */
  render: (openImageToImage: () => void) => ReactElement;
}

const PANELS: Record<PlaygroundRouteId, ToolPanel> = {
  "playground-text-to-image": {
    ownsRuntimeNotice: true,
    render: (openImageToImage) => <TextToImagePanel onOpenImageToImage={openImageToImage} />,
  },
  "playground-image-to-image": { ownsRuntimeNotice: true, render: () => <ImageToImagePanel /> },
  "playground-image-upscaling": { ownsRuntimeNotice: true, render: () => <ImageUpscalingPanel /> },
  // OCR needs the GenieX CLI. Its panel has no runtime notice, only a server one, so it is not shown while locked.
  "playground-ocr": { ownsRuntimeNotice: false, render: () => <OcrPanel /> },
  "playground-speech-to-text": {
    ownsRuntimeNotice: true,
    render: () => <SpeechToTextPanel />,
  },
  "playground-text-to-speech": { ownsRuntimeNotice: true, render: () => <TextToSpeechPanel /> },
  "playground-audio-to-audio": { ownsRuntimeNotice: true, render: () => <AudioToAudioPanel /> },
};

/** One Playground tool: its title and one-line subtitle from the route table, then its panel. */
export default function PlaygroundSectionPage({ routeId }: { routeId: PlaygroundRouteId }) {
  const navigate = useNavigate();
  const lockedReason = useRuntimeLocks();
  const route = routeById(routeId);
  const { ownsRuntimeNotice, render } = PANELS[routeId];

  if (route?.needs && lockedReason(route.needs) !== null && !ownsRuntimeNotice) {
    return <Navigate to="/playground" replace />;
  }

  return (
    <div className="playground-page__page">
      <div className="playground-page__inner">
        <PageHeader title={route?.title} subtitle={route?.description} />
        {render(() => navigate("/playground/image-to-image"))}
      </div>
    </div>
  );
}

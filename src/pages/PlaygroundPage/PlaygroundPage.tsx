import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { Tab, TabList, Tooltip } from "@fluentui/react-components";
import { useState } from "react";
import AudioToAudioPanel from "../../components/playground/AudioToAudioPanel/AudioToAudioPanel";
import ImageToImagePanel from "../../components/playground/ImageToImagePanel/ImageToImagePanel";
import ImageUpscalingPanel from "../../components/playground/ImageUpscalingPanel/ImageUpscalingPanel";
import OcrPanel from "../../components/playground/OcrPanel/OcrPanel";
import SpeechToTextPanel from "../../components/playground/SpeechToTextPanel/SpeechToTextPanel";
import TextToImagePanel from "../../components/playground/TextToImagePanel/TextToImagePanel";
import TextToSpeechPanel from "../../components/playground/TextToSpeechPanel/TextToSpeechPanel";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { useRuntimeLocks } from "../../hooks/useRuntimeLocks";
import { OCR_TAB_LABEL } from "../../utils/ocrText";
import { SD_CPP_RUNTIME_ID } from "../../utils/playground";
import type { RuntimeNeed } from "../../utils/runtimeGuards";
import { SHERPA_RUNTIME_ID } from "../../utils/speech";
import { UPSCALE_TAB_LABEL } from "../../utils/upscaleText";
import "./PlaygroundPage.css";

const TEXT_TO_IMAGE = "text-to-image";
const IMAGE_TO_IMAGE = "image-to-image";
const IMAGE_UPSCALING = "image-upscaling";
const OCR = "ocr";
const SPEECH_TO_TEXT = "speech-to-text";
const TEXT_TO_SPEECH = "text-to-speech";
const AUDIO_TO_AUDIO = "audio-to-audio";

/** Functions of the Playground, in tab order. `needs` is the runtime the tab cannot work without. */
const FUNCTIONS: { value: string; label: string; needs: RuntimeNeed }[] = [
  { value: TEXT_TO_IMAGE, label: "Text to image", needs: SD_CPP_RUNTIME_ID },
  { value: IMAGE_TO_IMAGE, label: "Image to image", needs: SD_CPP_RUNTIME_ID },
  { value: IMAGE_UPSCALING, label: UPSCALE_TAB_LABEL, needs: SD_CPP_RUNTIME_ID },
  { value: OCR, label: OCR_TAB_LABEL, needs: "cli" },
  { value: SPEECH_TO_TEXT, label: "Speech to text", needs: SHERPA_RUNTIME_ID },
  { value: TEXT_TO_SPEECH, label: "Text to speech", needs: SHERPA_RUNTIME_ID },
  { value: AUDIO_TO_AUDIO, label: "Audio to audio", needs: SHERPA_RUNTIME_ID },
];

/**
 * Playground for special models: models that do more than chat, one function at a time. Each
 * function has its own panel; the model state lives in the Playground store, so it survives a visit
 * to another page.
 */
export default function PlaygroundPage() {
  const [chosenId, setFunctionId] = useState(TEXT_TO_IMAGE);
  const lockedReason = useRuntimeLocks();
  // A tab whose runtime goes missing (or is missing from the start) is not shown; the first open tab is.
  const isOpen = (id: string) => {
    const fn = FUNCTIONS.find((f) => f.value === id);
    return fn !== undefined && lockedReason(fn.needs) === null;
  };
  const functionId = isOpen(chosenId)
    ? chosenId
    : (FUNCTIONS.find((f) => isOpen(f.value))?.value ?? chosenId);

  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    setFunctionId(String(data.value));
  };

  return (
    <div className="playground-page__page">
      <div className="playground-page__inner">
        <PageHeader
          eyebrow="● PLAYGROUND"
          title="Playground"
          subtitle="Try models that do more than chat, one function at a time."
        />
        <TabList
          aria-label="Playground functions"
          selectedValue={functionId}
          onTabSelect={handleTabSelect}
        >
          {FUNCTIONS.map((fn) => {
            const reason = lockedReason(fn.needs);
            const tab = (
              <Tab key={fn.value} value={fn.value} disabled={reason !== null}>
                {fn.label}
              </Tab>
            );
            // A disabled button gets no hover events, so the tooltip sits on a wrapper around it.
            return reason ? (
              <Tooltip key={fn.value} content={reason} relationship="description">
                <span>{tab}</span>
              </Tooltip>
            ) : (
              tab
            );
          })}
        </TabList>
        {functionId === TEXT_TO_IMAGE && (
          <TextToImagePanel onOpenImageToImage={() => setFunctionId(IMAGE_TO_IMAGE)} />
        )}
        {functionId === IMAGE_TO_IMAGE && <ImageToImagePanel />}
        {functionId === IMAGE_UPSCALING && <ImageUpscalingPanel />}
        {functionId === OCR && <OcrPanel />}
        {functionId === SPEECH_TO_TEXT && <SpeechToTextPanel />}
        {functionId === TEXT_TO_SPEECH && <TextToSpeechPanel />}
        {functionId === AUDIO_TO_AUDIO && <AudioToAudioPanel />}
      </div>
    </div>
  );
}

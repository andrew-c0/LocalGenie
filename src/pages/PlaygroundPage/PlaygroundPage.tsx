import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { Tab, TabList } from "@fluentui/react-components";
import { useState } from "react";
import AudioToAudioPanel from "../../components/playground/AudioToAudioPanel/AudioToAudioPanel";
import ImageToImagePanel from "../../components/playground/ImageToImagePanel/ImageToImagePanel";
import ImageUpscalingPanel from "../../components/playground/ImageUpscalingPanel/ImageUpscalingPanel";
import OcrPanel from "../../components/playground/OcrPanel/OcrPanel";
import SpeechToTextPanel from "../../components/playground/SpeechToTextPanel/SpeechToTextPanel";
import TextToImagePanel from "../../components/playground/TextToImagePanel/TextToImagePanel";
import TextToSpeechPanel from "../../components/playground/TextToSpeechPanel/TextToSpeechPanel";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { OCR_TAB_LABEL } from "../../utils/ocrText";
import { UPSCALE_TAB_LABEL } from "../../utils/upscaleText";
import "./PlaygroundPage.css";

const TEXT_TO_IMAGE = "text-to-image";
const IMAGE_TO_IMAGE = "image-to-image";
const IMAGE_UPSCALING = "image-upscaling";
const OCR = "ocr";
const SPEECH_TO_TEXT = "speech-to-text";
const TEXT_TO_SPEECH = "text-to-speech";
const AUDIO_TO_AUDIO = "audio-to-audio";

/** Functions of the Playground, in tab order. */
const FUNCTIONS: { value: string; label: string }[] = [
  { value: TEXT_TO_IMAGE, label: "Text to image" },
  { value: IMAGE_TO_IMAGE, label: "Image to image" },
  { value: IMAGE_UPSCALING, label: UPSCALE_TAB_LABEL },
  { value: OCR, label: OCR_TAB_LABEL },
  { value: SPEECH_TO_TEXT, label: "Speech to text" },
  { value: TEXT_TO_SPEECH, label: "Text to speech" },
  { value: AUDIO_TO_AUDIO, label: "Audio to audio" },
];

/**
 * Playground for special models: models that do more than chat, one function at a time. Each
 * function has its own panel; the model state lives in the Playground store, so it survives a visit
 * to another page.
 */
export default function PlaygroundPage() {
  const [functionId, setFunctionId] = useState(TEXT_TO_IMAGE);

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
          {FUNCTIONS.map((fn) => (
            <Tab key={fn.value} value={fn.value}>
              {fn.label}
            </Tab>
          ))}
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

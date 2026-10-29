import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { Tab, TabList } from "@fluentui/react-components";
import { useState } from "react";
import ImageToImagePanel from "../../components/playground/ImageToImagePanel/ImageToImagePanel";
import SpeechToTextPanel from "../../components/playground/SpeechToTextPanel/SpeechToTextPanel";
import TextToImagePanel from "../../components/playground/TextToImagePanel/TextToImagePanel";
import TextToSpeechPanel from "../../components/playground/TextToSpeechPanel/TextToSpeechPanel";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import "./PlaygroundPage.css";

const TEXT_TO_IMAGE = "text-to-image";
const IMAGE_TO_IMAGE = "image-to-image";
const SPEECH_TO_TEXT = "speech-to-text";
const TEXT_TO_SPEECH = "text-to-speech";

/** Functions of the Playground. Video is listed and disabled until it is built. */
const FUNCTIONS: { value: string; label: string; enabled: boolean }[] = [
  { value: TEXT_TO_IMAGE, label: "Text to image", enabled: true },
  { value: IMAGE_TO_IMAGE, label: "Image to image", enabled: true },
  { value: SPEECH_TO_TEXT, label: "Speech to text", enabled: true },
  { value: TEXT_TO_SPEECH, label: "Text to speech", enabled: true },
  { value: "video", label: "Video", enabled: false },
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
            <Tab key={fn.value} value={fn.value} disabled={!fn.enabled}>
              {fn.label}
            </Tab>
          ))}
        </TabList>
        {functionId === TEXT_TO_IMAGE && (
          <TextToImagePanel onOpenImageToImage={() => setFunctionId(IMAGE_TO_IMAGE)} />
        )}
        {functionId === IMAGE_TO_IMAGE && <ImageToImagePanel />}
        {functionId === SPEECH_TO_TEXT && <SpeechToTextPanel />}
        {functionId === TEXT_TO_SPEECH && <TextToSpeechPanel />}
      </div>
    </div>
  );
}

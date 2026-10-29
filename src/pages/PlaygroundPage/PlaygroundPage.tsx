import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { Tab, TabList } from "@fluentui/react-components";
import { useState } from "react";
import TextToImagePanel from "../../components/playground/TextToImagePanel/TextToImagePanel";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import "./PlaygroundPage.css";

const TEXT_TO_IMAGE = "text-to-image";

/** Functions of the Playground. Only text to image is built; the rest are listed and disabled. */
const FUNCTIONS: { value: string; label: string; enabled: boolean }[] = [
  { value: TEXT_TO_IMAGE, label: "Text to image", enabled: true },
  { value: "image-to-image", label: "Image to image", enabled: false },
  { value: "speech-to-text", label: "Speech to text", enabled: false },
  { value: "text-to-speech", label: "Text to speech", enabled: false },
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
        {functionId === TEXT_TO_IMAGE && <TextToImagePanel />}
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { useOcrStore } from "../../stores/ocrStore";
import { usePlaygroundStore } from "../../stores/playgroundStore";
import { useSpeechStore } from "../../stores/speechStore";
import {
  keepsSpeechAudio,
  type PlaygroundToolId,
  type SpeechToolId,
} from "../../utils/playgroundReset";

/** Clears the work area of the tool that was left. `entered` is the tool now open, or null when the user left the Playground. */
type LeftToolReset = (entered: PlaygroundToolId | null) => void;

function speechReset(tool: SpeechToolId): LeftToolReset {
  return (entered) =>
    useSpeechStore.getState().resetSpeechWork(tool, keepsSpeechAudio(tool, entered));
}

/**
 * The reset of each tool, by the store action it runs. It is typed by tool id, so a new tool must add its reset here.
 * Preferences (model, form, settings, modes, voice) are never reset; a running job is never touched.
 */
const RESET_WHEN_LEFT: Record<PlaygroundToolId, LeftToolReset> = {
  "playground-text-to-image": () => usePlaygroundStore.getState().resetTextToImageWork(),
  "playground-image-to-image": () => usePlaygroundStore.getState().resetImageToImageWork(),
  "playground-image-upscaling": () => usePlaygroundStore.getState().resetUpscaleWork(),
  "playground-ocr": () => useOcrStore.getState().resetOcrWork(),
  "playground-speech-to-text": speechReset("playground-speech-to-text"),
  "playground-text-to-speech": speechReset("playground-text-to-speech"),
  "playground-audio-to-audio": speechReset("playground-audio-to-audio"),
};

/**
 * Keeps the Playground tools from leaking work into each other. When the open tool changes, the tool that was left is
 * reset. When the page goes away (the user leaves the Playground), the open tool is reset.
 *
 * Both paths run from effects, and not while a panel mounts, so a tab switch can not wipe the input that the target
 * tool was given just before (see "Use this image as input"). Under StrictMode, React runs an effect's cleanup and then
 * the effect again straight away; the unmount reset waits one microtask and checks that the page is really gone.
 */
export function usePlaygroundTabReset(toolId: PlaygroundToolId): void {
  const openTool = useRef<PlaygroundToolId | null>(null);
  const isMounted = useRef(false);

  useEffect(() => {
    const leftTool = openTool.current;
    openTool.current = toolId;
    if (leftTool !== null && leftTool !== toolId) RESET_WHEN_LEFT[leftTool](toolId);
  }, [toolId]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      queueMicrotask(() => {
        const leftTool = openTool.current;
        if (isMounted.current || leftTool === null) return;
        RESET_WHEN_LEFT[leftTool](null);
      });
    };
  }, []);
}

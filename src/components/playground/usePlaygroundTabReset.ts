import { useEffect, useRef } from "react";
import { useOcrStore } from "../../stores/ocrStore";
import { usePlaygroundStore } from "../../stores/playgroundStore";
import { useSpeechStore } from "../../stores/speechStore";
import type { PlaygroundToolId } from "../../utils/playgroundReset";

/**
 * The reset of each tool, by the store action it runs. It is typed by tool id, so a new tool must add its reset here.
 * Preferences (model, form, settings, modes, voice, audio task) are never reset; a running job is never touched.
 */
const RESET_WHEN_LEFT: Record<PlaygroundToolId, () => void> = {
  "playground-text-to-image": () => usePlaygroundStore.getState().resetTextToImageWork(),
  "playground-image-to-image": () => usePlaygroundStore.getState().resetImageToImageWork(),
  "playground-image-upscaling": () => usePlaygroundStore.getState().resetUpscaleWork(),
  "playground-ocr": () => useOcrStore.getState().resetOcrWork(),
  "playground-audio": () => useSpeechStore.getState().resetAudioWork(),
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
    if (leftTool !== null && leftTool !== toolId) RESET_WHEN_LEFT[leftTool]();
  }, [toolId]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      queueMicrotask(() => {
        const leftTool = openTool.current;
        if (isMounted.current || leftTool === null) return;
        RESET_WHEN_LEFT[leftTool]();
      });
    };
  }, []);
}

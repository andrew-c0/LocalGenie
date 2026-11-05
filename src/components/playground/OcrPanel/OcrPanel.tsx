import { useModelStore } from "../../../stores/modelStore";
import { useOcrStore } from "../../../stores/ocrStore";
import { effectiveOcrMode, ocrBlockedReason, ocrOversizedWarning } from "../../../utils/ocr";
import { OCR_ACTION_LABEL, OCR_INPUT_HINT, OCR_SECTION_TITLE } from "../../../utils/ocrText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { GenerateFooter } from "../ImageGeneration/GenerateFooter/GenerateFooter";
import { InputImagePicker } from "../ImageToImagePanel/InputImagePicker/InputImagePicker";
import { useInputImagePicker } from "../ImageToImagePanel/InputImagePicker/useInputImagePicker";
import { PickModelHint } from "../PickModelHint/PickModelHint";
import { OcrModeField } from "./OcrModeField/OcrModeField";
import { OcrProgress } from "./OcrProgress/OcrProgress";
import { OcrResultCard } from "./OcrResultCard/OcrResultCard";
import { OcrResultPlaceholder } from "./OcrResultPlaceholder/OcrResultPlaceholder";
import { useOcr } from "./useOcr";
import "./OcrPanel.css";

/**
 * OCR: the input picture, how to read it, the running job and the recognised text. The model and where it
 * runs are picked in the header's selector, which also starts the GenieX server the job runs on.
 */
export default function OcrPanel() {
  const { run, cancel } = useOcr();

  const models = useOcrStore((s) => s.models);
  const selectedModelId = useOcrStore((s) => s.selectedModelId);
  const serverRunning = useModelStore((s) => s.serverStatus.running);
  const serverStarting = useOcrStore((s) => s.serverStarting);
  const chosenMode = useOcrStore((s) => s.mode);
  const setMode = useOcrStore((s) => s.setMode);
  const input = useOcrStore((s) => s.input);
  const setInput = useOcrStore((s) => s.setInput);
  const setInputSize = useOcrStore((s) => s.setInputSize);
  const job = useOcrStore((s) => s.job);
  const result = useOcrStore((s) => s.result);
  const picker = useInputImagePicker(setInput);

  const selected = models?.find((m) => m.id === selectedModelId) ?? null;
  const mode = effectiveOcrMode(selected, chosenMode);
  const blockedReason = ocrBlockedReason({
    model: selected,
    inputPath: input?.path ?? null,
    serverRunning,
    serverStarting,
    jobRunning: job !== null,
  });
  const sizeWarning = ocrOversizedWarning(input?.sourceSize ?? null);

  const start = () => {
    if (!selected || !input) return;
    run(selected, input.path, input.name, mode);
  };

  return (
    <Flex direction="column" gap="l">
      {models && selected === null && <PickModelHint />}

      {models && (
        <div className="ocr-panel__layout">
          <SurfaceCard title={OCR_SECTION_TITLE}>
            <Flex direction="column" gap="m">
              <InputImagePicker
                input={input}
                error={picker.error}
                disabled={job !== null}
                hint={OCR_INPUT_HINT}
                onChoose={picker.chooseFile}
                onSourceSize={setInputSize}
              />
              {sizeWarning && <ErrorBanner message={sizeWarning} />}
              <OcrModeField
                modes={selected?.modes ?? []}
                mode={mode}
                disabled={job !== null}
                onModeChange={setMode}
              />
              <GenerateFooter
                onGenerate={start}
                blockedReason={blockedReason}
                actionLabel={OCR_ACTION_LABEL}
              />
            </Flex>
          </SurfaceCard>
          <Flex direction="column" gap="l">
            {job && (
              <div className="ocr-panel__fill">
                <OcrProgress job={job} onCancel={cancel} />
              </div>
            )}
            {result && (
              <div className="ocr-panel__fill">
                <OcrResultCard key={result.jobId} result={result} />
              </div>
            )}
            {job === null && result === null && (
              <div className="ocr-panel__fill">
                <OcrResultPlaceholder />
              </div>
            )}
          </Flex>
        </div>
      )}
    </Flex>
  );
}

import { useOcrStore } from "../../../stores/ocrStore";
import { effectiveOcrMode, ocrBlockedReason, ocrOversizedWarning } from "../../../utils/ocr";
import {
  OCR_ACTION_LABEL,
  OCR_INPUT_HINT,
  OCR_LOADING_MODELS,
  OCR_SECTION_TITLE,
  OCR_TIME_NOTE,
} from "../../../utils/ocrText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { GenerateFooter } from "../ImageGeneration/GenerateFooter/GenerateFooter";
import { InputImagePicker } from "../ImageToImagePanel/InputImagePicker/InputImagePicker";
import { useInputImagePicker } from "../ImageToImagePanel/InputImagePicker/useInputImagePicker";
import { OcrModelColumn } from "./OcrModelColumn/OcrModelColumn";
import { OcrOptions } from "./OcrOptions/OcrOptions";
import { OcrProgress } from "./OcrProgress/OcrProgress";
import { OcrResultCard } from "./OcrResultCard/OcrResultCard";
import { OcrServerNotice } from "./OcrServerNotice/OcrServerNotice";
import { useOcr } from "./useOcr";
import { useOcrModels } from "./useOcrModels";
import { useOcrServer } from "./useOcrServer";

/**
 * OCR: the models on the left; the input picture, the read mode, the compute choices, the running
 * job and the recognised text on the right. The job runs on the GenieX server.
 */
export default function OcrPanel() {
  const { models, loadError } = useOcrModels();
  const server = useOcrServer();
  const { run, cancel } = useOcr();

  const selectedModelId = useOcrStore((s) => s.selectedModelId);
  const selectModel = useOcrStore((s) => s.selectModel);
  const chosenMode = useOcrStore((s) => s.mode);
  const setMode = useOcrStore((s) => s.setMode);
  const settings = useOcrStore((s) => s.settings);
  const setCompute = useOcrStore((s) => s.setCompute);
  const setVisionCompute = useOcrStore((s) => s.setVisionCompute);
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
    serverRunning: server.running,
    jobRunning: job !== null,
  });
  const sizeWarning = ocrOversizedWarning(input?.sourceSize ?? null);

  const start = () => {
    if (!selected || !input) return;
    run(selected, input.path, input.name, mode);
  };

  return (
    <Flex direction="column" gap="l">
      {!server.running && (
        <OcrServerNotice starting={server.starting} error={server.error} onStart={server.start} />
      )}
      {loadError && <ErrorBanner message={loadError} />}
      {!models && !loadError && <StateBlock message={OCR_LOADING_MODELS} />}

      {models && (
        <Flex gap="l" align="start">
          <OcrModelColumn
            models={models}
            selectedModelId={selectedModelId}
            onSelect={selectModel}
          />

          <Flex direction="column" gap="l" className="flex-grow">
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
                <OcrOptions
                  modes={selected?.modes ?? []}
                  mode={mode}
                  settings={settings}
                  disabled={job !== null}
                  onModeChange={setMode}
                  onComputeChange={setCompute}
                  onVisionComputeChange={setVisionCompute}
                />
                <GenerateFooter
                  onGenerate={start}
                  blockedReason={blockedReason}
                  actionLabel={OCR_ACTION_LABEL}
                  note={OCR_TIME_NOTE}
                />
              </Flex>
            </SurfaceCard>
            {job && <OcrProgress job={job} onCancel={cancel} />}
            {result && <OcrResultCard result={result} />}
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}

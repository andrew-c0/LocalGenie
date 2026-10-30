import { Button, Textarea } from "@fluentui/react-components";
import { saveOcrText } from "../../../../services/playground";
import type { OcrResult } from "../../../../types";
import { errorMessage } from "../../../../utils/errorMessage";
import { formatDuration } from "../../../../utils/format";
import { ocrSaveName } from "../../../../utils/ocr";
import {
  OCR_CANCELLED_MESSAGE,
  OCR_COPIED_TITLE,
  OCR_COPY_FAILED_TITLE,
  OCR_COPY_LABEL,
  OCR_EMPTY_MESSAGE,
  OCR_FAILED_MESSAGE,
  OCR_RESULT_TITLE,
  OCR_SAVE_FAILED_TITLE,
  OCR_SAVE_LABEL,
  OCR_SAVED_TITLE,
  ocrTookLabel,
} from "../../../../utils/ocrText";
import { toast } from "../../../../utils/toast";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../ui/Flex/Flex";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Body, Meta } from "../../../ui/Typography/Typography";

interface OcrResultCardProps {
  result: OcrResult;
}

/** The last OCR job: the text in a read-only field with Copy and Save as .txt, and how long it took. */
export function OcrResultCard({ result }: OcrResultCardProps) {
  if (result.status === "error") {
    return (
      <SurfaceCard title={OCR_RESULT_TITLE}>
        <ErrorBanner message={result.error ?? OCR_FAILED_MESSAGE} />
      </SurfaceCard>
    );
  }
  if (result.status === "cancelled") {
    return (
      <SurfaceCard title={OCR_RESULT_TITLE}>
        <Body>{OCR_CANCELLED_MESSAGE}</Body>
      </SurfaceCard>
    );
  }

  const text = result.text ?? "";

  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(OCR_COPIED_TITLE))
      .catch((err: unknown) => toast.error(OCR_COPY_FAILED_TITLE, errorMessage(err)));
  };

  const save = () => {
    saveOcrText(text, ocrSaveName(result.inputName))
      .then((path) => {
        if (path) toast.success(OCR_SAVED_TITLE, path);
      })
      .catch((err: unknown) => toast.error(OCR_SAVE_FAILED_TITLE, errorMessage(err)));
  };

  return (
    <SurfaceCard
      title={OCR_RESULT_TITLE}
      action={
        <Flex gap="s">
          <Button appearance="secondary" onClick={copy} disabled={text === ""}>
            {OCR_COPY_LABEL}
          </Button>
          <Button appearance="secondary" onClick={save} disabled={text === ""}>
            {OCR_SAVE_LABEL}
          </Button>
        </Flex>
      }
    >
      <Flex direction="column" gap="s">
        <Textarea aria-label={OCR_RESULT_TITLE} readOnly resize="vertical" rows={10} value={text} />
        {text === "" && <Meta>{OCR_EMPTY_MESSAGE}</Meta>}
        {result.seconds !== null && (
          <Meta>{ocrTookLabel(formatDuration(result.seconds * 1000))}</Meta>
        )}
      </Flex>
    </SurfaceCard>
  );
}

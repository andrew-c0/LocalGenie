import { OCR_PLACEHOLDER_MESSAGE, OCR_RESULT_TITLE } from "../../../../utils/ocrText";
import { SurfaceCard } from "../../../ui/SurfaceCard/SurfaceCard";
import { Secondary } from "../../../ui/Typography/Typography";

/** The result's place in the right column before any job has run, so the page does not look half empty. */
export function OcrResultPlaceholder() {
  return (
    <SurfaceCard title={OCR_RESULT_TITLE}>
      <Secondary>{OCR_PLACEHOLDER_MESSAGE}</Secondary>
    </SurfaceCard>
  );
}

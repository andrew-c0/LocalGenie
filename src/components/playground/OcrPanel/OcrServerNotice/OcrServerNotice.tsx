import { Button } from "@fluentui/react-components";
import { OCR_SERVER_NOTICE, OCR_START_SERVER_LABEL } from "../../../../utils/ocrText";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { StateBlock } from "../../../ui/StateBlock/StateBlock";

interface OcrServerNoticeProps {
  starting: boolean;
  error: string | null;
  onStart: () => void;
}

/** Shown when the GenieX server is not running, since OCR runs on it. The button starts the server. */
export function OcrServerNotice({ starting, error, onStart }: OcrServerNoticeProps) {
  return (
    <StateBlock icon="🔌" message={OCR_SERVER_NOTICE}>
      <Button appearance="primary" onClick={onStart} disabled={starting}>
        {OCR_START_SERVER_LABEL}
      </Button>
      {error && <ErrorBanner message={error} />}
    </StateBlock>
  );
}

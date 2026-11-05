import { useEffect, useState } from "react";
import { DECODE_FAILED_MESSAGE } from "../../../utils/audioText";
import { errorMessage } from "../../../utils/errorMessage";
import { type DecodedWaveform, decodeWaveform } from "./decodeWaveform";

/** What the decode of one data URL gave. Kept with its source, so a previous clip is never drawn for a new one. */
interface DecodeOutcome {
  source: string;
  decoded: DecodedWaveform | null;
  error: string | null;
}

/**
 * The decoded samples of a data URL, or its decode error. Both are null while the decode runs. The decode runs once
 * per data URL.
 */
export function useWaveformSamples(dataUrl: string | null): {
  decoded: DecodedWaveform | null;
  error: string | null;
} {
  const [outcome, setOutcome] = useState<DecodeOutcome | null>(null);

  useEffect(() => {
    if (!dataUrl) return;
    let active = true;
    decodeWaveform(dataUrl)
      .then((decoded) => {
        if (active) setOutcome({ source: dataUrl, decoded, error: null });
      })
      .catch((err: unknown) => {
        if (active) {
          setOutcome({
            source: dataUrl,
            decoded: null,
            error: errorMessage(err, DECODE_FAILED_MESSAGE),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [dataUrl]);

  if (!dataUrl || outcome?.source !== dataUrl) return { decoded: null, error: null };
  return { decoded: outcome.decoded, error: outcome.error };
}

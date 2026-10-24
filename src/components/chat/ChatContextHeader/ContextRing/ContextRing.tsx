import { Tooltip } from "@fluentui/react-components";
import { Meta } from "../../../ui/Typography/Typography";
import "./ContextRing.css";

interface ContextRingProps {
  /** Share of the context window used by the chat text, 0–100. */
  textPercent: number;
  /** Share of the context window used by attached text files, 0–100. Drawn after the text. */
  filePercent: number;
  /** Tooltip first line, for example "1,200 / 4,096 tokens used". Also the accessible name. */
  label: string;
  /** Tooltip second line, for example "350 from attached files". Omitted when there are none. */
  fileLabel?: string;
}

/**
 * Circular progress for context usage: the total percentage sits in the middle. Text fills the
 * brand-coloured arc, and text files fill a second arc after it in another colour. The counts show on
 * hover. Fluent has no circular progress component, so the ring is a plain SVG driven by `pathLength`.
 */
export function ContextRing({ textPercent, filePercent, label, fileLabel }: ContextRingProps) {
  const text = clampPercent(textPercent, 100);
  const file = clampPercent(filePercent, 100 - text);
  const total = text + file;
  const tone = total > 90 ? "context-ring--danger" : "context-ring--brand";

  return (
    <Tooltip
      content={
        <>
          <div>{label}</div>
          {fileLabel && <div className="context-ring__file-tip">{fileLabel}</div>}
        </>
      }
      relationship="label"
    >
      <div className={`context-ring ${tone}`} role="img" aria-label={label}>
        <svg className="context-ring__svg" viewBox="0 0 36 36" aria-hidden="true">
          <circle className="context-ring__track" cx="18" cy="18" r="15.9155" pathLength="100" />
          <circle
            className="context-ring__value"
            cx="18"
            cy="18"
            r="15.9155"
            pathLength="100"
            strokeDasharray={`${text} ${100 - text}`}
            strokeDashoffset="25"
          />
          {file > 0 && (
            <circle
              className="context-ring__file"
              cx="18"
              cy="18"
              r="15.9155"
              pathLength="100"
              strokeDasharray={`${file} ${100 - file}`}
              strokeDashoffset={25 - text}
            />
          )}
        </svg>
        <span className="context-ring__text">
          <Meta>{total}%</Meta>
        </span>
      </div>
    </Tooltip>
  );
}

/** Whole percent in 0..max. A NaN input reads as zero. */
function clampPercent(value: number, max: number): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.min(max, Math.max(0, rounded));
}

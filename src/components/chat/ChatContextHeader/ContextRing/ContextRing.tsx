import { Tooltip } from "@fluentui/react-components";
import { Meta } from "../../../ui/Typography/Typography";
import "./ContextRing.css";

interface ContextRingProps {
  /** Share of the context window in use, 0–100. */
  percent: number;
  /** Tooltip text, for example "1,200 of 4,096 tokens used". */
  label: string;
}

/**
 * Circular progress for context usage: the percentage sits in the middle and the exact count shows on
 * hover. Fluent has no circular progress component, so the ring is a plain SVG driven by `pathLength`.
 */
export function ContextRing({ percent, label }: ContextRingProps) {
  const pct = Math.min(100, Math.max(0, Math.round(percent)));
  const tone = pct > 90 ? "context-ring--danger" : "context-ring--brand";

  return (
    <Tooltip content={label} relationship="label">
      <div className={`context-ring ${tone}`} role="img" aria-label={label}>
        <svg className="context-ring__svg" viewBox="0 0 36 36" aria-hidden="true">
          <circle className="context-ring__track" cx="18" cy="18" r="15.9155" pathLength="100" />
          <circle
            className="context-ring__value"
            cx="18"
            cy="18"
            r="15.9155"
            pathLength="100"
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeDashoffset="25"
          />
        </svg>
        <span className="context-ring__text">
          <Meta>{pct}%</Meta>
        </span>
      </div>
    </Tooltip>
  );
}

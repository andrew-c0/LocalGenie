import { type KeyboardEvent, type PointerEvent, useMemo, useRef } from "react";
import { PLAYHEAD_LABEL } from "../../../utils/audioText";
import {
  axisTicks,
  BAR_GAP_PX,
  BAR_WIDTH_PX,
  barCountFor,
  barHeightPx,
  bucketPeaks,
  formatClock,
  peakLevel,
  percentToTime,
  seekForKey,
  timeToPercent,
} from "../../../utils/audioWaveform";
import { percentFromPointer } from "../../../utils/imageCompare";
import { Meta } from "../../ui/Typography/Typography";
import { useElementWidth } from "./useElementWidth";
import "./WaveformArea.css";

/** The bars' drawn height. The panel is taller, leaving room above and below them. */
const BARS_HEIGHT_PX = 80;
/** Silence still shows a dot of this height, so the baseline reads as a row of bars. */
const MIN_BAR_PX = 2;
const MAX_AXIS_TICKS = 6;

interface WaveformAreaProps {
  samples: Float32Array;
  /** The clip's length in seconds. */
  duration: number;
  currentTime: number;
  onSeek: (seconds: number) => void;
}

/** The axis label's position class: the first and last labels hug the edges, the others centre on their tick. */
function tickEdgeClass(index: number, count: number): string {
  if (index === 0) return "waveform-area__tick--start";
  if (index === count - 1) return "waveform-area__tick--end";
  return "";
}

/**
 * The waveform drawn as thin rounded bars, with faint gridlines at round times, the playhead and the time axis under it.
 * Dragging anywhere on the panel seeks; the playhead is also a slider for the keyboard. Bars left of the playhead are
 * in the brand colour.
 */
export function WaveformArea({ samples, duration, currentTime, onSeek }: WaveformAreaProps) {
  const barsRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(barsRef);
  const peaks = useMemo(() => bucketPeaks(samples, barCountFor(width)), [samples, width]);
  const playedPercent = timeToPercent(currentTime, duration);
  const playedBars = (playedPercent / 100) * peaks.length;
  const ticks = axisTicks(duration, MAX_AXIS_TICKS);

  const seekFromPointer = (stage: HTMLElement, clientX: number) => {
    const rect = stage.getBoundingClientRect();
    onSeek(percentToTime(percentFromPointer(clientX, rect.left, rect.width), duration));
  };

  // The panel captures the pointer, so a drag keeps seeking when the pointer leaves it.
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromPointer(event.currentTarget, event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    seekFromPointer(event.currentTarget, event.clientX);
  };

  const handlePlayheadKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = seekForKey(currentTime, event.key, event.shiftKey, duration);
    if (next === null) return;
    event.preventDefault();
    onSeek(next);
  };

  return (
    <div className="waveform-area">
      <div
        className="waveform-area__stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <div className="waveform-area__bars" ref={barsRef}>
          {width > 0 && (
            <svg
              className="waveform-area__svg"
              width={width}
              height={BARS_HEIGHT_PX}
              viewBox={`0 0 ${width} ${BARS_HEIGHT_PX}`}
              aria-hidden="true"
              focusable="false"
            >
              {peaks.map((peak, index) => {
                const height = barHeightPx(peakLevel(peak), BARS_HEIGHT_PX, MIN_BAR_PX);
                const played = index < playedBars;
                return (
                  <rect
                    // biome-ignore lint/suspicious/noArrayIndexKey: a bar keeps its position in the waveform
                    key={index}
                    className={
                      played
                        ? "waveform-area__bar waveform-area__bar--played"
                        : "waveform-area__bar"
                    }
                    x={index * (BAR_WIDTH_PX + BAR_GAP_PX)}
                    y={(BARS_HEIGHT_PX - height) / 2}
                    width={BAR_WIDTH_PX}
                    height={height}
                    rx={BAR_WIDTH_PX / 2}
                  />
                );
              })}
            </svg>
          )}
        </div>
        {ticks.map((tick) => (
          <div
            key={tick}
            className="waveform-area__grid"
            style={{ left: `${timeToPercent(tick, duration)}%` }}
          />
        ))}
        <div
          className="waveform-area__playhead"
          style={{ left: `${playedPercent}%` }}
          role="slider"
          tabIndex={0}
          aria-label={PLAYHEAD_LABEL}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={formatClock(currentTime)}
          onKeyDown={handlePlayheadKey}
        >
          <span className="waveform-area__dot waveform-area__dot--top" />
          <span className="waveform-area__line" />
          <span className="waveform-area__dot waveform-area__dot--bottom" />
        </div>
      </div>
      <div className="waveform-area__axis">
        {ticks.map((tick, index) => (
          <span
            key={tick}
            className={`waveform-area__tick ${tickEdgeClass(index, ticks.length)}`}
            style={{ left: `${timeToPercent(tick, duration)}%` }}
          >
            <Meta>{formatClock(tick)}</Meta>
          </span>
        ))}
      </div>
    </div>
  );
}

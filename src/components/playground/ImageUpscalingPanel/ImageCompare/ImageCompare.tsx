import { ArrowsBidirectionalRegular } from "@fluentui/react-icons";
import { type KeyboardEvent, type PointerEvent, useState } from "react";
import type { ImageSize } from "../../../../types";
import {
  COMPARE_START_PERCENT,
  percentFromKey,
  percentFromPointer,
} from "../../../../utils/imageCompare";
import {
  UPSCALE_AFTER_LABEL,
  UPSCALE_BEFORE_LABEL,
  UPSCALE_COMPARE_SLIDER_LABEL,
  UPSCALE_INPUT_ALT,
  UPSCALE_OUTPUT_ALT,
} from "../../../../utils/upscaleText";
import { Meta } from "../../../ui/Typography/Typography";
import "./ImageCompare.css";

interface ImageCompareProps {
  /** The input picture, shown left of the divider. */
  before: string;
  /** The upscaled picture. It sets the box's shape and shows right of the divider. */
  after: string;
  /** The upscaled picture's size when it is already known, so the box has its shape from the first frame. */
  size?: ImageSize | null;
  /** Reports the size once the upscaled picture has loaded. */
  onSize?: (size: ImageSize) => void;
}

/**
 * The input and the upscaled picture in one box. A divider splits them: the input shows left of it and the
 * upscaled picture right of it. The divider moves by dragging anywhere in the box or by the arrow keys on its handle.
 */
export function ImageCompare({ before, after, size: knownSize = null, onSize }: ImageCompareProps) {
  const [position, setPosition] = useState(COMPARE_START_PERCENT);
  const [loadedSize, setLoadedSize] = useState<ImageSize | null>(null);
  const size = loadedSize ?? knownSize;

  const moveTo = (box: HTMLElement, clientX: number) => {
    const rect = box.getBoundingClientRect();
    setPosition(percentFromPointer(clientX, rect.left, rect.width));
  };

  // The box captures the pointer, so a drag keeps moving the divider when the pointer leaves the box.
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event.currentTarget, event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveTo(event.currentTarget, event.clientX);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = percentFromKey(position, event.key, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    setPosition(next);
  };

  // The upscaled picture sets the box's shape, so both pictures are drawn at the same displayed size.
  const handleAfterLoad = (image: HTMLImageElement) => {
    if (image.naturalWidth === 0 || image.naturalHeight === 0) return;
    const loaded = { width: image.naturalWidth, height: image.naturalHeight };
    setLoadedSize(loaded);
    onSize?.(loaded);
  };

  const boxStyle = size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined;

  return (
    <div
      className="image-compare__box"
      style={boxStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      <img
        className="image-compare__picture"
        src={after}
        alt={UPSCALE_OUTPUT_ALT}
        draggable={false}
        onLoad={(event) => handleAfterLoad(event.currentTarget)}
      />
      <img
        className="image-compare__picture"
        src={before}
        alt={UPSCALE_INPUT_ALT}
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />
      <div className="image-compare__divider" style={{ left: `${position}%` }}>
        <div
          className="image-compare__handle"
          role="slider"
          tabIndex={0}
          aria-label={UPSCALE_COMPARE_SLIDER_LABEL}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          onKeyDown={handleKeyDown}
        >
          <ArrowsBidirectionalRegular />
        </div>
      </div>
      <span className="image-compare__label image-compare__label--before">
        <Meta>{UPSCALE_BEFORE_LABEL}</Meta>
      </span>
      <span className="image-compare__label image-compare__label--after">
        <Meta>{UPSCALE_AFTER_LABEL}</Meta>
      </span>
    </div>
  );
}

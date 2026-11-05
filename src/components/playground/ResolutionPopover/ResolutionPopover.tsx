import { Button, Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-components";
import { ResizeRegular } from "@fluentui/react-icons";
import type { ImageSize } from "../../../types";
import { sizeLabel } from "../../../utils/playgroundText";
import { ImageSizeSection } from "../ImageGeneration/ImageSettingsFields/ImageSizeSection";
import "./ResolutionPopover.css";

interface ResolutionPopoverProps {
  width: number;
  height: number;
  /** The selected model's native size. Null when no model is selected. */
  nativeSize: ImageSize | null;
  onChange: (patch: Partial<ImageSize>) => void;
  /** Width and height must be multiples of this. Left out for the default step of text to image. */
  step?: number;
  /** Replaces the native-size hint. Left out to show the model's native size. */
  hint?: string;
}

/**
 * The picture size as a button that shows "width x height". It opens the size editor in a popover, so the size is
 * out of the way until it is needed. The button stays usable while a job runs, as the size is editable then.
 */
export function ResolutionPopover({
  width,
  height,
  nativeSize,
  onChange,
  step,
  hint,
}: ResolutionPopoverProps) {
  return (
    <Popover positioning="below-end">
      <PopoverTrigger disableButtonEnhancement>
        <Button appearance="secondary" icon={<ResizeRegular />}>
          {sizeLabel(width, height)}
        </Button>
      </PopoverTrigger>
      <PopoverSurface>
        <div className="resolution-popover__body">
          <ImageSizeSection
            width={width}
            height={height}
            nativeSize={nativeSize}
            onChange={onChange}
            step={step}
            hint={hint}
          />
        </div>
      </PopoverSurface>
    </Popover>
  );
}

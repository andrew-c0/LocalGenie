import { Button, Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-components";
import { ResizeRegular } from "@fluentui/react-icons";
import type { ImageSize } from "../../../../types";
import { EDIT_SIZE_STEP } from "../../../../utils/imageToImage";
import { EDIT_SIZE_HINT, editSizeLabel } from "../../../../utils/imageToImageText";
import { ImageSizeSection } from "../../ImageGeneration/ImageSettingsFields/ImageSizeSection";
import "./EditResolutionPopover.css";

interface EditResolutionPopoverProps {
  width: number;
  height: number;
  /** The selected model's native size. Null when no model is selected. */
  nativeSize: ImageSize | null;
  onChange: (patch: Partial<ImageSize>) => void;
}

/**
 * The picture size as a button that shows "width x height". It opens the size editor in a popover, so the size is
 * out of the way until it is needed. The button stays usable while a job runs, as the size is editable then.
 */
export function EditResolutionPopover({
  width,
  height,
  nativeSize,
  onChange,
}: EditResolutionPopoverProps) {
  return (
    <Popover positioning="below-end">
      <PopoverTrigger disableButtonEnhancement>
        <Button appearance="secondary" icon={<ResizeRegular />}>
          {editSizeLabel(width, height)}
        </Button>
      </PopoverTrigger>
      <PopoverSurface>
        <div className="edit-resolution__body">
          <ImageSizeSection
            width={width}
            height={height}
            nativeSize={nativeSize}
            onChange={onChange}
            step={EDIT_SIZE_STEP}
            hint={EDIT_SIZE_HINT}
          />
        </div>
      </PopoverSurface>
    </Popover>
  );
}

import type { ImageSize } from "../../../types";
import { EDIT_SIZE_STEP } from "../../../utils/imageToImage";
import { EDIT_SIZE_HINT } from "../../../utils/imageToImageText";
import { Flex } from "../../ui/Flex/Flex";
import { CompareToggle } from "../CompareToggle/CompareToggle";
import { ResolutionPopover } from "../ResolutionPopover/ResolutionPopover";

interface EditHeaderActionProps {
  width: number;
  height: number;
  /** The selected model's native size. Null when no model is selected. */
  nativeSize: ImageSize | null;
  onSizeChange: (patch: Partial<ImageSize>) => void;
  /** The Compare switch shows only while a saved result for the picture on the form exists. */
  pictureShown: boolean;
  comparing: boolean;
  compareReady: boolean;
  onToggleCompare: () => void;
}

/** The card header of image to image: the picture size button and, once there is a result, Compare. */
export function EditHeaderAction({
  width,
  height,
  nativeSize,
  onSizeChange,
  pictureShown,
  comparing,
  compareReady,
  onToggleCompare,
}: EditHeaderActionProps) {
  return (
    <Flex gap="m" align="center">
      <ResolutionPopover
        width={width}
        height={height}
        nativeSize={nativeSize}
        onChange={onSizeChange}
        step={EDIT_SIZE_STEP}
        hint={EDIT_SIZE_HINT}
      />
      {pictureShown && (
        <CompareToggle checked={comparing} disabled={!compareReady} onToggle={onToggleCompare} />
      )}
    </Flex>
  );
}

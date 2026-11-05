import type { ImageSize } from "../../../types";
import { Flex } from "../../ui/Flex/Flex";
import { CompareToggle } from "../CompareToggle/CompareToggle";
import { EditResolutionPopover } from "./EditResolutionPopover/EditResolutionPopover";

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
      <EditResolutionPopover
        width={width}
        height={height}
        nativeSize={nativeSize}
        onChange={onSizeChange}
      />
      {pictureShown && (
        <CompareToggle checked={comparing} disabled={!compareReady} onToggle={onToggleCompare} />
      )}
    </Flex>
  );
}

import { Button } from "@fluentui/react-components";
import type { ImageSize } from "../../../../types";
import { sizeHintText, sizePresetOptions } from "../../../../utils/playground";
import { Flex } from "../../../ui/Flex/Flex";
import { Meta } from "../../../ui/Typography/Typography";
import { SizeField } from "./SizeField";

interface ImageSizeSectionProps {
  width: number;
  height: number;
  /** The selected model's default size. Null when no model is selected. */
  nativeSize: ImageSize | null;
  onChange: (patch: Partial<ImageSize>) => void;
}

/** Width and height as typed numbers, the preset sizes and a hint about the model's native size. */
export function ImageSizeSection({ width, height, nativeSize, onChange }: ImageSizeSectionProps) {
  const presets = sizePresetOptions(nativeSize);

  return (
    <Flex direction="column" gap="s">
      <Flex gap="m" wrap align="end">
        <SizeField fieldName="Width" value={width} onCommit={(next) => onChange({ width: next })} />
        <SizeField
          fieldName="Height"
          value={height}
          onCommit={(next) => onChange({ height: next })}
        />
      </Flex>
      <Flex gap="s" wrap>
        {presets.map((preset) => (
          <Button
            key={preset.label}
            size="small"
            appearance="secondary"
            onClick={() => onChange({ width: preset.width, height: preset.height })}
          >
            {preset.label}
          </Button>
        ))}
      </Flex>
      <Meta>{sizeHintText(nativeSize)}</Meta>
    </Flex>
  );
}

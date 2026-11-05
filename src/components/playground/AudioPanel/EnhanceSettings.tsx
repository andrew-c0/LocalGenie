import type { EnhanceKind } from "../../../types";
import { ENHANCE_TASK_LABEL, ENHANCE_TASK_OPTIONS } from "../../../utils/audioText";
import { ChipRow } from "../../ui/ChipRow/ChipRow";

interface EnhanceSettingsProps {
  value: EnhanceKind;
  onChange: (kind: EnhanceKind) => void;
}

/** The clean up or split choice. What its saved files are like is in the info icon next to the action. */
export function EnhanceSettings({ value, onChange }: EnhanceSettingsProps) {
  return (
    <ChipRow
      ariaLabel={ENHANCE_TASK_LABEL}
      options={ENHANCE_TASK_OPTIONS}
      value={value}
      onChange={onChange}
    />
  );
}

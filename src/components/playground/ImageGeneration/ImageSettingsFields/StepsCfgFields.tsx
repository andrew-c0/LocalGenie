import { Field, SpinButton } from "@fluentui/react-components";
import type { ImageForm, ImageModel } from "../../../../types";
import { imageFormControls } from "../../../../utils/playground";
import { CFG_SCALE_HELP, STEPS_HELP } from "../../../../utils/playgroundText";
import { spinNumber } from "../../../../utils/spinValue";
import { HelpLabel } from "../../../ui/HelpLabel/HelpLabel";
import { LockedTooltip } from "../../../ui/LockedTooltip/LockedTooltip";
import "./settingFields.css";

const MAX_STEPS = 150;
const CFG_MIN = 1;
const CFG_MAX = 20;
const CFG_STEP = 0.5;

interface StepsCfgFieldsProps {
  form: Pick<ImageForm, "steps" | "cfgScale">;
  model: ImageModel | null;
  onChange: (patch: Partial<ImageForm>) => void;
}

/**
 * The step count and the CFG scale, as two fields of one width. A CFG the model fixes is locked: the reason joins the
 * info text and shows as a tooltip, with no line under the box. The caller lays the fields out in a row.
 */
export function StepsCfgFields({ form, model, onChange }: StepsCfgFieldsProps) {
  const lockedCfgReason = imageFormControls(model).cfgReason;

  return (
    <>
      <Field label={<HelpLabel label="Steps" help={STEPS_HELP} />}>
        <div className="setting-field__spin">
          <SpinButton
            min={1}
            max={MAX_STEPS}
            step={1}
            value={form.steps}
            onChange={(_, data) =>
              onChange({ steps: spinNumber(data, 1, MAX_STEPS) ?? form.steps })
            }
          />
        </div>
      </Field>
      <Field
        label={
          <HelpLabel
            label="CFG scale"
            help={lockedCfgReason ? `${CFG_SCALE_HELP} ${lockedCfgReason}` : CFG_SCALE_HELP}
          />
        }
      >
        <LockedTooltip reason={lockedCfgReason}>
          <div className="setting-field__spin">
            <SpinButton
              disabled={lockedCfgReason !== null}
              min={CFG_MIN}
              max={CFG_MAX}
              step={CFG_STEP}
              precision={1}
              value={form.cfgScale}
              onChange={(_, data) =>
                onChange({ cfgScale: spinNumber(data, CFG_MIN, CFG_MAX) ?? form.cfgScale })
              }
            />
          </div>
        </LockedTooltip>
      </Field>
    </>
  );
}

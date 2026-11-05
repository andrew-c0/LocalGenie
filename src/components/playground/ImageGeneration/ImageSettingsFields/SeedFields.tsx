import { Field, SpinButton, Switch } from "@fluentui/react-components";
import type { ImageForm } from "../../../../types";
import { SEED_HELP } from "../../../../utils/playgroundText";
import { spinNumber } from "../../../../utils/spinValue";
import { HelpLabel } from "../../../ui/HelpLabel/HelpLabel";
import "./settingFields.css";

interface SeedFieldsProps {
  form: Pick<ImageForm, "randomSeed" | "seed">;
  onChange: (patch: Partial<ImageForm>) => void;
}

/** The seed box with the Random seed switch beside it, as one control. The caller lays it out in a row. */
export function SeedFields({ form, onChange }: SeedFieldsProps) {
  return (
    <div className="seed-fields">
      <Field label={<HelpLabel label="Seed" help={SEED_HELP} />}>
        <div className="setting-field__spin">
          <SpinButton
            disabled={form.randomSeed}
            step={1}
            value={form.seed}
            onChange={(_, data) => onChange({ seed: spinNumber(data) ?? form.seed })}
          />
        </div>
      </Field>
      <div className="seed-fields__switch">
        <Switch
          label="Random seed"
          checked={form.randomSeed}
          onChange={(_, data) => onChange({ randomSeed: data.checked })}
        />
      </div>
    </div>
  );
}

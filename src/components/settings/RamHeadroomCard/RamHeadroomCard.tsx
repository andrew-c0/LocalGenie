import { Button, Card, Field, SpinButton, Spinner } from "@fluentui/react-components";
import { SaveRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { getRamHeadroomPercent, saveRamHeadroomPercent } from "../../../services/ramHeadroom";
import { errorMessage } from "../../../utils/errorMessage";
import {
  isValidHeadroom,
  RAM_HEADROOM_MESSAGE,
  RAM_HEADROOM_RANGE,
} from "../../../utils/ramHeadroom";
import { toast } from "../../../utils/toast";
import { Meta, SectionTitle } from "../../ui/Typography/Typography";
import "./RamHeadroomCard.css";

/**
 * Edits the share of total RAM kept free when a model loads. The model selector warns about a model
 * that would leave less free than this. The setting never blocks a load.
 */
export default function RamHeadroomCard() {
  const [saved, setSaved] = useState<number | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getRamHeadroomPercent()
      .then((percent) => {
        setSaved(percent);
        setDraft(percent);
      })
      .catch((err: unknown) => console.error("Failed to load RAM headroom:", err));
  }, []);

  const valid = isValidHeadroom(draft);
  const canSave = valid && draft !== saved && !saving;

  const handleSave = async () => {
    if (!isValidHeadroom(draft)) return;
    setSaving(true);
    try {
      await saveRamHeadroomPercent(draft);
      setSaved(draft);
      toast.success("RAM headroom saved");
    } catch (err) {
      toast.error("Could not save RAM headroom", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="ram-headroom-card__stack">
        <SectionTitle>RAM headroom</SectionTitle>
        <Field
          label="Keep free (% of total RAM)"
          hint="The model selector flags a model that would leave less free RAM than this. Loading is not blocked."
          validationState={draft !== null && !valid ? "error" : "none"}
          validationMessage={draft !== null && !valid ? RAM_HEADROOM_MESSAGE : undefined}
        >
          <SpinButton
            value={draft}
            min={RAM_HEADROOM_RANGE.min}
            max={RAM_HEADROOM_RANGE.max}
            step={1}
            disabled={saved === null}
            onChange={(_, data) => setDraft(data.value ?? null)}
          />
        </Field>
        <Meta>Estimates are rough. Treat a warning as a reason to check, not a verdict.</Meta>
        <div className="ram-headroom-card__actions">
          <Button
            appearance="primary"
            icon={saving ? <Spinner size="tiny" /> : <SaveRegular />}
            onClick={handleSave}
            disabled={!canSave}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

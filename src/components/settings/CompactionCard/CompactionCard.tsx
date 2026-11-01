import { Button, Card, Field, Slider, Spinner, Switch } from "@fluentui/react-components";
import { SaveRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { getCompactionSettings, saveCompactionSettings } from "../../../services/compaction";
import type { CompactionSettings } from "../../../types";
import { COMPACTION_DEFAULTS, COMPACTION_THRESHOLD_RANGE } from "../../../utils/compactionSettings";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";
import { Flex } from "../../ui/Flex/Flex";
import { BodyStrong, Meta, SectionTitle } from "../../ui/Typography/Typography";
import "./CompactionCard.css";

/**
 * Edits whether long conversations are summarised, and how full the context gets first. The threshold
 * only shows while the switch is on. The controls edit a draft; Save stores it.
 */
export default function CompactionCard() {
  const [saved, setSaved] = useState<CompactionSettings | null>(null);
  const [draft, setDraft] = useState<CompactionSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCompactionSettings()
      .then((settings) => {
        setSaved(settings);
        setDraft(settings);
      })
      .catch((err: unknown) => console.error("Failed to load conversation compaction:", err));
  }, []);

  const updateDraft = (patch: Partial<CompactionSettings>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const dirty =
    saved !== null &&
    draft !== null &&
    (draft.enabled !== saved.enabled || draft.thresholdPercent !== saved.thresholdPercent);
  const canSave = dirty && !saving;

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await saveCompactionSettings(draft);
      setSaved(draft);
      toast.success("Conversation compaction saved");
    } catch (err) {
      toast.error("Could not save conversation compaction", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Flex direction="column" gap="s">
        <SectionTitle>Conversation compaction</SectionTitle>
        <Switch
          label="Compact long conversations"
          checked={draft?.enabled ?? COMPACTION_DEFAULTS.enabled}
          disabled={saved === null}
          onChange={(_, data) => updateDraft({ enabled: data.checked })}
        />
        <Meta>
          Summarises the whole conversation with the loaded model when the context is nearly full.
          Off by default; a summary cannot be undone.
        </Meta>
        {draft?.enabled && (
          <Field label="Compact when the context is this full (% of the window)">
            <Flex align="center" gap="m">
              <div className="flex-grow">
                {/* Fluent sets a fixed width on the slider; it fills the row instead. */}
                <Slider
                  className="compaction-card__slider"
                  min={COMPACTION_THRESHOLD_RANGE.min}
                  max={COMPACTION_THRESHOLD_RANGE.max}
                  step={1}
                  value={draft.thresholdPercent}
                  onChange={(_, data) => updateDraft({ thresholdPercent: data.value })}
                />
              </div>
              <div className="compaction-card__value">
                <BodyStrong>{draft.thresholdPercent} %</BodyStrong>
              </div>
            </Flex>
          </Field>
        )}
        <Flex justify="end">
          <Button
            appearance="primary"
            icon={saving ? <Spinner size="tiny" /> : <SaveRegular />}
            onClick={handleSave}
            disabled={!canSave}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}

import { Checkbox, Field, Radio, RadioGroup, Slider } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { getCompactionSettings } from "../../../services/compaction";
import type { CompactionSettings } from "../../../types";
import {
  COMPACTION_DEFAULTS,
  COMPACTION_THRESHOLD_RANGE,
  type CompactionChoice,
  type CompactionOverrides,
  compactionChoiceOf,
  compactionOverrideOf,
  describeCompaction,
} from "../../../utils/compactionSettings";
import { Flex } from "../../ui/Flex/Flex";
import { BodyStrong } from "../../ui/Typography/Typography";
import "./CompactionOverride.css";

const CHOICES: { value: CompactionChoice; label: string }[] = [
  { value: "app", label: "Use app setting" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

/** The helper text under the choice. For "Use app setting" it names what that resolves to now. */
function choiceHint(choice: CompactionChoice, app: CompactionSettings | null): string {
  if (choice === "on")
    return "Summarises this conversation when its context reaches the threshold.";
  if (choice === "off") return "Never summarises this conversation.";
  return app ? `Now: ${describeCompaction(app)}.` : "Uses the app setting.";
}

interface CompactionOverrideProps {
  /** The chat's compaction fields, from the drawer's draft. */
  value: CompactionOverrides;
  onChange: (patch: CompactionOverrides) => void;
}

/**
 * The chat's own compaction setting: follow the app, or force it on or off. When on, the chat uses its
 * own threshold or the app's. The helper text shows what the choice means right now. Renders two fields
 * for the drawer's column to space.
 */
export function CompactionOverride({ value, onChange }: CompactionOverrideProps) {
  const [app, setApp] = useState<CompactionSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCompactionSettings()
      .then((settings) => {
        if (!cancelled) setApp(settings);
      })
      .catch((err: unknown) => console.error("Failed to load conversation compaction:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  const choice = compactionChoiceOf(value.compaction);
  const appThreshold = app?.thresholdPercent ?? COMPACTION_DEFAULTS.thresholdPercent;
  const usesAppThreshold = value.compactionThreshold === undefined;

  const chooseChoice = (raw: string) => {
    const next = CHOICES.find((option) => option.value === raw)?.value;
    if (!next) return;
    onChange({
      compaction: compactionOverrideOf(next),
      // The app's choice also drops the chat's own threshold, so nothing stale stays stored.
      compactionThreshold: next === "app" ? undefined : value.compactionThreshold,
    });
  };

  return (
    <>
      <Field label="Conversation compaction" hint={choiceHint(choice, app)}>
        <RadioGroup value={choice} onChange={(_, data) => chooseChoice(data.value)}>
          {CHOICES.map((option) => (
            <Radio key={option.value} value={option.value} label={option.label} />
          ))}
        </RadioGroup>
      </Field>

      {choice === "on" && (
        <Field
          label="Threshold"
          hint="Summarises when the context reaches this share of the window."
        >
          <Checkbox
            label={`Use the app threshold (${appThreshold}%)`}
            checked={usesAppThreshold}
            onChange={(_, data) =>
              onChange({ compactionThreshold: data.checked === true ? undefined : appThreshold })
            }
          />
          {!usesAppThreshold && (
            <Flex align="center" gap="m">
              <div className="flex-grow">
                {/* Fluent sets a fixed width on the slider; it fills the row instead. */}
                <Slider
                  className="compaction-override__slider"
                  min={COMPACTION_THRESHOLD_RANGE.min}
                  max={COMPACTION_THRESHOLD_RANGE.max}
                  step={1}
                  value={value.compactionThreshold ?? appThreshold}
                  onChange={(_, data) => onChange({ compactionThreshold: data.value })}
                />
              </div>
              <div className="compaction-override__value">
                <BodyStrong>{value.compactionThreshold ?? appThreshold} %</BodyStrong>
              </div>
            </Flex>
          )}
        </Field>
      )}
    </>
  );
}

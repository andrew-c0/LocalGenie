import { Button, Card, Field, Slider, SpinButton, Spinner } from "@fluentui/react-components";
import { ArrowResetRegular, SaveRegular } from "@fluentui/react-icons";
import { REPETITION_PENALTY_DECIMALS, SAMPLING_RANGES } from "../../../utils/modelSettings";
import { spinDisplayValue, spinNumber } from "../../../utils/spinValue";
import { Flex } from "../../ui/Flex/Flex";
import { BodyStrong, Meta, SectionTitle } from "../../ui/Typography/Typography";
import "./DispatchSamplingCard.css";
import { useDispatchSamplingDraft } from "./useDispatchSamplingDraft";

const KEEPALIVE_NOTE =
  "An idle model is unloaded by the server after its keepalive timeout (Settings > Application & Runtime > Server runtime card, default 300 s). Raise it if conversations wait long between turns.";

/** The optional fields are left unset by default: the model's own value applies. */
const UNSET_HINT = "Empty uses the model's value.";

/**
 * Edits the sampling every Dispatch conversation runs with, whatever model is loaded. Load settings are not here.
 * The controls edit a draft; Save stores it, and Reset to defaults fills the draft with the defaults.
 */
export default function DispatchSamplingCard() {
  const { draft, problem, canSave, isSaving, isAtDefaults, updateDraft, resetDraft, saveDraft } =
    useDispatchSamplingDraft();

  return (
    <Card>
      <Flex direction="column" gap="s">
        <SectionTitle>Dispatch</SectionTitle>
        <Meta>
          Used by every Dispatch conversation, whatever model is loaded. A lower temperature gives
          more consistent tool use.
        </Meta>
        <Meta>{KEEPALIVE_NOTE}</Meta>

        <Field label="Temperature" hint="Randomness. Lower gives more consistent replies.">
          <Flex align="center" gap="m">
            <div className="flex-grow">
              {/* Fluent sets a fixed width on the slider; it fills the row instead. */}
              <Slider
                className="dispatch-sampling-card__slider"
                min={SAMPLING_RANGES.temperature.min}
                max={SAMPLING_RANGES.temperature.max}
                step={SAMPLING_RANGES.temperature.step}
                value={draft.temperature}
                onChange={(_, data) => updateDraft({ temperature: data.value })}
              />
            </div>
            <div className="dispatch-sampling-card__value">
              <BodyStrong>{draft.temperature.toFixed(1)}</BodyStrong>
            </div>
          </Flex>
        </Field>

        <Field
          label="Top P"
          hint="Sample only from the most likely tokens that add up to this share."
        >
          <Flex align="center" gap="m">
            <div className="flex-grow">
              <Slider
                className="dispatch-sampling-card__slider"
                min={SAMPLING_RANGES.topP.min}
                max={SAMPLING_RANGES.topP.max}
                step={SAMPLING_RANGES.topP.step}
                value={draft.topP}
                onChange={(_, data) => updateDraft({ topP: data.value })}
              />
            </div>
            <div className="dispatch-sampling-card__value">
              <BodyStrong>{draft.topP.toFixed(2)}</BodyStrong>
            </div>
          </Flex>
        </Field>

        <Field
          label="Repetition penalty"
          hint="Lowers the chance of repeating tokens. 1 means none."
        >
          <SpinButton
            value={draft.repetitionPenalty}
            displayValue={spinDisplayValue(draft.repetitionPenalty, REPETITION_PENALTY_DECIMALS)}
            min={SAMPLING_RANGES.repetitionPenalty.min}
            max={SAMPLING_RANGES.repetitionPenalty.max}
            step={SAMPLING_RANGES.repetitionPenalty.step}
            onChange={(_, data) => {
              const value = spinNumber(
                data,
                SAMPLING_RANGES.repetitionPenalty.min,
                SAMPLING_RANGES.repetitionPenalty.max,
              );
              if (value != null) updateDraft({ repetitionPenalty: value });
            }}
          />
        </Field>

        <Field label="Top K" hint={UNSET_HINT}>
          <SpinButton
            value={draft.topK ?? null}
            placeholder="Model's value"
            min={SAMPLING_RANGES.topK.min}
            max={SAMPLING_RANGES.topK.max}
            step={SAMPLING_RANGES.topK.step}
            onChange={(_, data) =>
              updateDraft({
                topK:
                  spinNumber(data, SAMPLING_RANGES.topK.min, SAMPLING_RANGES.topK.max) ?? undefined,
              })
            }
          />
        </Field>

        <Field label="Min P" hint={UNSET_HINT}>
          <SpinButton
            value={draft.minP ?? null}
            placeholder="Model's value"
            min={SAMPLING_RANGES.minP.min}
            max={SAMPLING_RANGES.minP.max}
            step={SAMPLING_RANGES.minP.step}
            onChange={(_, data) =>
              updateDraft({
                minP:
                  spinNumber(data, SAMPLING_RANGES.minP.min, SAMPLING_RANGES.minP.max) ?? undefined,
              })
            }
          />
        </Field>

        <Field label="Max tokens" hint={`Longest reply in tokens. ${UNSET_HINT}`}>
          <SpinButton
            value={draft.maxTokens ?? null}
            placeholder="Model's value"
            min={SAMPLING_RANGES.maxTokens.min}
            max={SAMPLING_RANGES.maxTokens.max}
            step={SAMPLING_RANGES.maxTokens.step}
            onChange={(_, data) =>
              updateDraft({
                maxTokens:
                  spinNumber(data, SAMPLING_RANGES.maxTokens.min, SAMPLING_RANGES.maxTokens.max) ??
                  undefined,
              })
            }
          />
        </Field>

        {problem && <Meta>{problem}</Meta>}

        <Flex justify="end" gap="s">
          <Button
            appearance="secondary"
            icon={<ArrowResetRegular />}
            onClick={resetDraft}
            disabled={isSaving || isAtDefaults}
          >
            Reset to defaults
          </Button>
          <Button
            appearance="primary"
            icon={isSaving ? <Spinner size="tiny" /> : <SaveRegular />}
            onClick={saveDraft}
            disabled={!canSave}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}

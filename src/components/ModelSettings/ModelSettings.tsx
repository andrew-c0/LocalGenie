import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Divider,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Slider,
  SpinButton,
  Spinner,
  Subtitle1,
  Subtitle2,
  Switch,
  Textarea,
} from "@fluentui/react-components";
import { SaveRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import * as db from "../../services/database";
import { reloadModel } from "../../services/modelLoad";
import { defaultSettings, useModelStore } from "../../stores/modelStore";
import type { StoredModelSettings } from "../../types";
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_LOAD_SETTINGS,
  draftModelDisabledReason,
  engineOf,
  loadSettingDisabledReason,
  modelSettingsKey,
  POWER_MODES,
  SPEC_TYPES,
  sameModel,
} from "../../utils/modelSettings";
import { withSystemBlocks } from "../../utils/systemPrompt";
import { toast } from "../../utils/toast";
import { Body } from "../ui/Typography/Typography";
import SettingField from "./SettingField/SettingField";
import SystemPromptEditor from "./SystemPromptEditor/SystemPromptEditor";
import "./ModelSettings.css";

export default function ModelSettings() {
  const activeModelId = useModelStore((s) => s.activeModelId);
  const downloadedModels = useModelStore((s) => s.models);
  const headerCompute = useModelStore((s) => s.compute);

  // Manual pick from the dropdown. Null means "follow the active model".
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  // When the active model changes (loaded or switched), drop a stale manual pick.
  const [trackedActiveId, setTrackedActiveId] = useState(activeModelId);
  if (trackedActiveId !== activeModelId) {
    setTrackedActiveId(activeModelId);
    setSelectedModel(null);
  }
  const displayModel = selectedModel ?? activeModelId;
  const settingsKey = displayModel ? modelSettingsKey(displayModel) : null;

  const [settings, setSettings] = useState<StoredModelSettings>({ ...defaultSettings });
  const [nativeContext, setNativeContext] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Load saved settings and the model's own context window whenever the selected model changes
  useEffect(() => {
    if (!settingsKey) return;
    db.loadModelSettings(settingsKey)
      .then((saved) => setSettings(withSystemBlocks({ ...defaultSettings, ...saved })))
      .catch(() => {});
    db.loadNativeContext(settingsKey)
      .then(setNativeContext)
      .catch(() => setNativeContext(null));
  }, [settingsKey]);

  const handleSave = useCallback(async () => {
    if (!settingsKey || !displayModel) return;
    setSaving(true);
    let saved = false;
    try {
      await db.saveModelSettings(settingsKey, settings);
      saved = true;
    } catch (err) {
      console.error("Failed to save model settings:", err);
    }
    if (saved) toast.success("Model settings saved");

    // Load parameters only apply at load time, so a loaded model is reloaded to pick them up.
    const isLoaded = !!activeModelId && sameModel(activeModelId, displayModel);
    if (saved && isLoaded) {
      try {
        await reloadModel(displayModel);
        toast.success("Model reloaded", "It now uses the saved settings.");
      } catch (err) {
        toast.error("Model failed to reload", String(err));
      }
    }
    setSaving(false);
  }, [settingsKey, settings, displayModel, activeModelId]);

  const update = <K extends keyof StoredModelSettings>(key: K, value: StoredModelSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (!displayModel || !settingsKey) return null;

  const model = downloadedModels.find((m) => modelSettingsKey(m.name) === settingsKey);
  const engine = engineOf(model);
  const compute = settings.compute ?? headerCompute;

  const reason = {
    compute: loadSettingDisabledReason("compute", engine, compute),
    nctx: loadSettingDisabledReason("nctx", engine, compute),
    ngl: loadSettingDisabledReason("ngl", engine, compute),
    spec: loadSettingDisabledReason("spec", engine, compute),
    draftModel: draftModelDisabledReason(engine, settings.specType),
  };

  const temperature = settings.temperature ?? 0.7;
  const topP = settings.topP ?? 0.9;
  const minP = settings.minP ?? 0.05;

  return (
    <div className="model-settings__root">
      {downloadedModels.length > 0 && (
        <Field label="Model">
          <Dropdown
            className="model-settings__full-width"
            value={displayModel}
            selectedOptions={[displayModel]}
            onOptionSelect={(_, data) => {
              if (data.optionValue) setSelectedModel(data.optionValue);
            }}
          >
            {downloadedModels.map((m) => (
              <Option key={m.name} value={m.name}>
                {m.name}
              </Option>
            ))}
          </Dropdown>
        </Field>
      )}

      {activeModelId && displayModel && !sameModel(displayModel, activeModelId) && (
        <MessageBar intent="warning">
          <MessageBarBody>
            Editing settings for a model not currently loaded on the server.
          </MessageBarBody>
        </MessageBar>
      )}

      <section className="model-settings__section">
        <Subtitle1>Load</Subtitle1>
        <Body className="model-settings__hint">
          Sent with every message. If one of these changes, the model reloads on the next message.
        </Body>

        <SettingField
          label="Compute"
          info="Where the model runs: NPU, GPU or CPU. Empty uses the header choice."
          disabledReason={reason.compute}
        >
          <Dropdown
            className="model-settings__full-width"
            disabled={!!reason.compute}
            value={compute.toUpperCase()}
            selectedOptions={[compute]}
            onOptionSelect={(_, data) => {
              if (data.optionValue) update("compute", data.optionValue);
            }}
          >
            <Option value="npu">NPU</Option>
            <Option value="gpu">GPU</Option>
            <Option value="cpu">CPU</Option>
          </Dropdown>
        </SettingField>

        <SettingField
          label="Context Window"
          info="Context length in tokens the server allocates. Larger windows use more memory."
          disabledReason={reason.nctx}
        >
          <SpinButton
            disabled={!!reason.nctx}
            value={settings.nctx ?? nativeContext ?? DEFAULT_CONTEXT_WINDOW}
            min={512}
            max={131072}
            step={512}
            onChange={(_, data) => {
              if (data.value != null) update("nctx", data.value);
            }}
          />
        </SettingField>

        <SettingField
          label="Power Mode"
          info="HTP power and clock management. Burst is the server default and gives the highest speed."
        >
          <Dropdown
            className="model-settings__full-width"
            value={settings.powerMode ? settings.powerMode.replaceAll("_", " ") : "Default (burst)"}
            selectedOptions={[settings.powerMode ?? ""]}
            onOptionSelect={(_, data) => update("powerMode", data.optionValue || undefined)}
          >
            <Option value="">Default (burst)</Option>
            {POWER_MODES.map((mode) => (
              <Option key={mode} value={mode}>
                {mode.replaceAll("_", " ")}
              </Option>
            ))}
          </Dropdown>
        </SettingField>
      </section>

      <Divider />

      <section className="model-settings__section">
        <Subtitle1>Sampler</Subtitle1>

        <SettingField
          label="Temperature"
          info="Randomness. Lower gives more focused replies, higher gives more varied ones."
        >
          <div className="model-settings__slider-row">
            <Slider
              className="model-settings__slider"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(_, data) => update("temperature", data.value)}
            />
            <Body className="model-settings__slider-value">{temperature.toFixed(1)}</Body>
          </div>
        </SettingField>

        <SettingField
          label="Top P"
          info="Sample only from the smallest set of tokens whose probabilities add up to this value."
        >
          <div className="model-settings__slider-row">
            <Slider
              className="model-settings__slider"
              min={0}
              max={1}
              step={0.05}
              value={topP}
              onChange={(_, data) => update("topP", data.value)}
            />
            <Body className="model-settings__slider-value">{topP.toFixed(2)}</Body>
          </div>
        </SettingField>

        <SettingField
          label="Top K"
          info="Sample only from the K most likely next tokens. Lower is more focused."
        >
          <SpinButton
            value={settings.topK ?? 40}
            min={1}
            max={100}
            onChange={(_, data) => {
              if (data.value != null) update("topK", data.value);
            }}
          />
        </SettingField>

        <SettingField
          label="Min P"
          info="Drop tokens whose probability is below this fraction of the most likely token's."
        >
          <div className="model-settings__slider-row">
            <Slider
              className="model-settings__slider"
              min={0}
              max={1}
              step={0.01}
              value={minP}
              onChange={(_, data) => update("minP", data.value)}
            />
            <Body className="model-settings__slider-value">{minP.toFixed(2)}</Body>
          </div>
        </SettingField>

        <SettingField
          label="Repetition Penalty"
          info="Lowers the chance of repeating tokens already used. 1 means no penalty."
        >
          <SpinButton
            value={settings.repetitionPenalty ?? 1.1}
            min={1}
            max={2}
            step={0.1}
            onChange={(_, data) => {
              if (data.value != null) update("repetitionPenalty", data.value);
            }}
          />
        </SettingField>

        <SettingField
          label="Presence Penalty"
          info="Lowers the chance of any token that has already appeared, which nudges the reply toward new topics. Empty means unset."
        >
          <SpinButton
            value={settings.presencePenalty ?? null}
            placeholder="Unset"
            min={-2}
            max={2}
            step={0.1}
            onChange={(_, data) => update("presencePenalty", data.value ?? undefined)}
          />
        </SettingField>

        <SettingField
          label="Frequency Penalty"
          info="Lowers the chance of a token in proportion to how often it has appeared. Empty means unset."
        >
          <SpinButton
            value={settings.frequencyPenalty ?? null}
            placeholder="Unset"
            min={-2}
            max={2}
            step={0.1}
            onChange={(_, data) => update("frequencyPenalty", data.value ?? undefined)}
          />
        </SettingField>
      </section>

      <Divider />

      <section className="model-settings__section">
        <Subtitle1>Generation</Subtitle1>

        <SettingField
          label="Max Tokens"
          info="Longest reply allowed, in tokens. Empty uses the server default of 2048."
        >
          <SpinButton
            value={settings.maxTokens ?? null}
            placeholder="Unset (no limit)"
            min={256}
            max={32768}
            step={256}
            onChange={(_, data) => {
              // Clearing the field unsets the value so max_tokens is omitted.
              update("maxTokens", data.value ?? undefined);
            }}
          />
        </SettingField>

        <SettingField
          label="Seed"
          info="Fixes the random seed, so the same prompt and settings give the same reply. Empty means random."
        >
          <SpinButton
            value={settings.seed ?? null}
            placeholder="Random"
            step={1}
            onChange={(_, data) => update("seed", data.value ?? undefined)}
          />
        </SettingField>

        <SettingField
          label="Think Mode"
          info="Lets reasoning models think before they answer. The thinking is shown above the reply."
        >
          <Switch
            label="Think before answering"
            checked={settings.think ?? true}
            onChange={(_, data) => update("think", data.checked)}
          />
        </SettingField>

        <SettingField
          label="Grammar"
          info="Constrains the reply to a GBNF grammar, for example to force JSON or a fixed set of answers. Empty means unconstrained."
        >
          <Textarea
            className="model-settings__textarea"
            value={settings.grammarString ?? ""}
            onChange={(_, data) => update("grammarString", data.value || undefined)}
            placeholder="Optional GBNF grammar…"
          />
        </SettingField>
      </section>

      <Divider />

      <section className="model-settings__section">
        <Subtitle1>System Prompt</Subtitle1>
        <SettingField
          label="System Prompt"
          info="Instructions sent before every conversation. Add text, the current date and time, platform details, or a .txt or .md file read on every send."
        >
          <SystemPromptEditor
            blocks={settings.systemBlocks ?? []}
            onChange={(blocks) => update("systemBlocks", blocks)}
            contextWindow={settings.nctx ?? nativeContext ?? DEFAULT_CONTEXT_WINDOW}
          />
        </SettingField>
      </section>

      <Accordion collapsible>
        <AccordionItem value="advanced">
          <AccordionHeader>Advanced</AccordionHeader>
          <AccordionPanel>
            <div className="model-settings__section">
              <Subtitle2>llama.cpp</Subtitle2>

              <SettingField
                label="GPU Layers"
                info="How many model layers run on the GPU or NPU. -1 offloads all of them."
                disabledReason={reason.ngl}
              >
                <SpinButton
                  disabled={!!reason.ngl}
                  value={settings.ngl ?? DEFAULT_LOAD_SETTINGS.ngl}
                  min={-1}
                  max={999}
                  onChange={(_, data) => {
                    if (data.value != null) update("ngl", data.value);
                  }}
                />
              </SettingField>

              <Subtitle2>Speculative decoding</Subtitle2>

              <SettingField
                label="Speculation Type"
                info="Drafts tokens ahead and checks them in one pass, which can speed up generation. Off uses no speculation."
                disabledReason={reason.spec}
              >
                <Dropdown
                  className="model-settings__full-width"
                  disabled={!!reason.spec}
                  value={settings.specType ? settings.specType : "Off"}
                  selectedOptions={[settings.specType ?? ""]}
                  onOptionSelect={(_, data) => update("specType", data.optionValue || undefined)}
                >
                  <Option value="">Off</Option>
                  {SPEC_TYPES.map((type) => (
                    <Option key={type} value={type}>
                      {type}
                    </Option>
                  ))}
                </Dropdown>
              </SettingField>

              <SettingField
                label="Draft Model"
                info="Model that drafts the tokens for draft-* types. Use a catalogue name (org/repo:precision) or a local GGUF path."
                disabledReason={reason.draftModel}
              >
                <Input
                  className="model-settings__full-width"
                  disabled={!!reason.draftModel}
                  value={settings.specDraftModel ?? ""}
                  onChange={(_, data) => update("specDraftModel", data.value || undefined)}
                />
              </SettingField>

              <SettingField
                label="Draft Tokens"
                info="Most tokens drafted in one step. Empty uses the server default of 3."
                disabledReason={reason.spec}
              >
                <SpinButton
                  disabled={!!reason.spec}
                  value={settings.specNMax ?? null}
                  placeholder="Default (3)"
                  min={1}
                  max={32}
                  onChange={(_, data) => update("specNMax", data.value ?? undefined)}
                />
              </SettingField>

              <SettingField
                label="Min Draft Tokens"
                info="Fewest tokens drafted in one step. 0 uses the llama.cpp default."
                disabledReason={reason.spec}
              >
                <SpinButton
                  disabled={!!reason.spec}
                  value={settings.specNMin ?? null}
                  placeholder="Default (0)"
                  min={0}
                  max={32}
                  onChange={(_, data) => update("specNMin", data.value ?? undefined)}
                />
              </SettingField>

              <SettingField
                label="Min Draft Probability"
                info="Drafting stops when a token's probability falls below this value. 0 uses the llama.cpp default."
                disabledReason={reason.spec}
              >
                <SpinButton
                  disabled={!!reason.spec}
                  value={settings.specPMin ?? null}
                  placeholder="Default (0)"
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(_, data) => update("specPMin", data.value ?? undefined)}
                />
              </SettingField>
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      <div>
        <Button
          appearance="primary"
          icon={saving ? <Spinner size="tiny" /> : <SaveRegular />}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

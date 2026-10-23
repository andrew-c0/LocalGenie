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
import { useEffect, useState } from "react";
import { getModelCapabilities } from "../../services/models";
import { useModelStore } from "../../stores/modelStore";
import type { ModelCapabilities } from "../../types";
import { capabilityMap, isRejected, rejectedReason } from "../../utils/capabilityStatus";
import { capabilityRows, settingWarnings, thinkingNote } from "../../utils/modelCapabilities";
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_LOAD_SETTINGS,
  draftModelDisabledReason,
  engineOf,
  loadSettingDisabledReason,
  modelSettingsKey,
  POWER_MODES,
  SPEC_TYPES,
} from "../../utils/modelSettings";
import { type SettingsAction, settingsButtons } from "../../utils/settingsButtons";
import { Flex } from "../ui/Flex/Flex";
import { ProgressBar } from "../ui/ProgressBar/ProgressBar";
import { SurfaceCard } from "../ui/SurfaceCard/SurfaceCard";
import { Body } from "../ui/Typography/Typography";
import SettingField from "./SettingField/SettingField";
import SystemPromptEditor from "./SystemPromptEditor/SystemPromptEditor";
import { useCapabilityScan } from "./useCapabilityScan";
import { useModelSettingsForm } from "./useModelSettingsForm";
import "./ModelSettings.css";

/** Upper bound for the context window when the model's own length is not known. */
const MAX_CONTEXT_WINDOW = 131072;

export default function ModelSettings() {
  const activeModelId = useModelStore((s) => s.activeModelId);
  const downloadedModels = useModelStore((s) => s.models);
  const headerCompute = useModelStore((s) => s.compute);

  // The model the user picked from the dropdown. Loading a model never changes what is shown, so
  // the page stays still while the server loads.
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  // Chosen once, when the page first has a model to show: the loaded one, else the first downloaded.
  const [startModel, setStartModel] = useState<string | null>(null);
  const startCandidate = activeModelId ?? downloadedModels[0]?.name ?? null;
  if (startModel === null && startCandidate !== null) {
    setStartModel(startCandidate);
  }
  const displayModel = selectedModel ?? startModel;
  const settingsKey = displayModel ? modelSettingsKey(displayModel) : null;

  const [capabilities, setCapabilities] = useState<ModelCapabilities | null>(null);
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null);
  const form = useModelSettingsForm(displayModel ?? "", settingsKey ?? "");
  const { settings, update, nativeContext, pending } = form;
  const scan = useCapabilityScan(settingsKey ?? "");

  // Read the model file's capabilities. A reply for a model that is no longer shown is dropped.
  useEffect(() => {
    if (!settingsKey) return;
    let current = true;
    setCapabilities(null);
    setCapabilitiesError(null);
    getModelCapabilities(settingsKey)
      .then((caps) => {
        if (current) setCapabilities(caps);
      })
      .catch((err: unknown) => {
        if (current) setCapabilitiesError(String(err));
      });
    return () => {
      current = false;
    };
  }, [settingsKey]);

  if (!displayModel || !settingsKey) return null;

  const model = downloadedModels.find((m) => modelSettingsKey(m.name) === settingsKey);
  const engine = engineOf(model);
  const compute = settings.compute ?? headerCompute;

  const warnings = settingWarnings(engine, settings);
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
  const caps = capabilityMap(scan.entries);
  const buttons = settingsButtons({
    loadedModel: activeModelId,
    selectedModel: displayModel,
    scanning: scan.phase === "scanning",
  });
  // Any save or scan waits while another one runs, including a scan of another model.
  const blocked = pending !== null || scan.busy;
  const runAction: Record<SettingsAction, () => void> = {
    save: () => form.save(),
    saveAndLoad: () => form.saveAndLoad(),
    scan: () => scan.start(),
    reloadAndScan: () => scan.reloadAndScan(),
    cancelScan: scan.cancel,
  };

  const saveButtons = buttons.filter((b) => b.action === "save" || b.action === "saveAndLoad");
  const scanButtons = buttons.filter((b) => b.action !== "save" && b.action !== "saveAndLoad");
  const renderButton = (button: (typeof buttons)[number]) => (
    <Button
      key={button.action}
      appearance={button.appearance}
      icon={
        button.action === pending ? (
          <Spinner size="tiny" />
        ) : button.action === "save" || button.action === "saveAndLoad" ? (
          <SaveRegular />
        ) : undefined
      }
      disabled={button.action !== "cancelScan" && blocked}
      onClick={runAction[button.action]}
    >
      {button.label}
    </Button>
  );

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

      <SurfaceCard title="Model">
        {capabilities ? (
          <dl className="model-settings__facts">
            {capabilityRows(capabilities, caps).map((row) => (
              <div key={row.label} className="model-settings__fact">
                <dt>
                  <Body className="model-settings__fact-label">{row.label}</Body>
                </dt>
                <dd>
                  <Body>{row.value}</Body>
                </dd>
              </div>
            ))}
          </dl>
        ) : capabilitiesError ? (
          <MessageBar intent="warning">
            <MessageBarBody>Could not read the model file: {capabilitiesError}</MessageBarBody>
          </MessageBar>
        ) : (
          <Spinner size="tiny" label="Reading the model file…" />
        )}
        <Body className="model-settings__hint">
          Thinking, tool calls, vision and audio show Supported, Not supported or Not tested, from
          the latest scan.
        </Body>
      </SurfaceCard>

      <Divider />

      <section className="model-settings__section">
        <Subtitle1>Available settings</Subtitle1>
        <Body className="model-settings__hint">
          Tests each setting with a few short requests, using a fixed test setup rather than your
          saved settings. Reload &amp; Scan unloads every model, then loads this one with that
          setup.
        </Body>
        {scan.entries.some((e) => e.stale) ? (
          <Body className="model-settings__hint">
            Some results are out of date because the model file or GenieX changed. Scan again to
            refresh them.
          </Body>
        ) : (
          scan.entries.length === 0 && (
            <Body className="model-settings__hint">Not scanned yet.</Body>
          )
        )}
        {scan.error && (
          <MessageBar intent="error">
            <MessageBarBody>{scan.error}</MessageBarBody>
          </MessageBar>
        )}
        {scan.phase === "loading" && (
          <Spinner size="tiny" label="Loading the model with the scan setup…" />
        )}
        {scan.phase === "scanning" &&
          (scan.progress ? (
            <Flex direction="column" gap="xs">
              <ProgressBar value={(scan.progress.index / scan.progress.total) * 100} />
              <Body>
                Testing {scan.progress.key} ({scan.progress.index + 1} of {scan.progress.total})
              </Body>
            </Flex>
          ) : (
            <Spinner size="tiny" label="Starting the scan…" />
          ))}
        <Flex gap="s" wrap>
          {scanButtons.map(renderButton)}
        </Flex>
      </section>

      <Divider />

      <section className="model-settings__section">
        <Subtitle1>Load</Subtitle1>
        <Body className="model-settings__hint">
          Sent with every message. If one of these changes, the model reloads on the next message.
        </Body>

        <SettingField
          label="Compute"
          info="Where the model runs: NPU, GPU or CPU. Empty uses the header choice."
          disabledReason={reason.compute}
          warning={warnings.compute}
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
          warning={warnings.nctx}
        >
          <SpinButton
            disabled={!!reason.nctx}
            value={settings.nctx ?? nativeContext ?? DEFAULT_CONTEXT_WINDOW}
            min={512}
            max={nativeContext ?? MAX_CONTEXT_WINDOW}
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
          disabledReason={rejectedReason(caps.temperature)}
        >
          <div className="model-settings__slider-row">
            <Slider
              className="model-settings__slider"
              disabled={isRejected(caps.temperature)}
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
          disabledReason={rejectedReason(caps.topP)}
        >
          <div className="model-settings__slider-row">
            <Slider
              className="model-settings__slider"
              disabled={isRejected(caps.topP)}
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
          disabledReason={rejectedReason(caps.topK)}
        >
          <SpinButton
            disabled={isRejected(caps.topK)}
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
          disabledReason={rejectedReason(caps.minP)}
        >
          <div className="model-settings__slider-row">
            <Slider
              className="model-settings__slider"
              disabled={isRejected(caps.minP)}
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
          disabledReason={rejectedReason(caps.repetitionPenalty)}
        >
          <SpinButton
            disabled={isRejected(caps.repetitionPenalty)}
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
          disabledReason={rejectedReason(caps.presencePenalty)}
        >
          <SpinButton
            disabled={isRejected(caps.presencePenalty)}
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
          disabledReason={rejectedReason(caps.frequencyPenalty)}
        >
          <SpinButton
            disabled={isRejected(caps.frequencyPenalty)}
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
          disabledReason={rejectedReason(caps.maxTokens)}
        >
          <SpinButton
            disabled={isRejected(caps.maxTokens)}
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
          disabledReason={rejectedReason(caps.seed)}
        >
          <SpinButton
            disabled={isRejected(caps.seed)}
            value={settings.seed ?? null}
            placeholder="Random"
            step={1}
            onChange={(_, data) => update("seed", data.value ?? undefined)}
          />
        </SettingField>

        <SettingField
          label="Think Mode"
          info="Lets reasoning models think before they answer. The thinking is shown above the reply."
          note={thinkingNote(capabilities)}
          disabledReason={rejectedReason(caps.thinking)}
        >
          <Switch
            label="Think before answering"
            disabled={isRejected(caps.thinking)}
            checked={settings.think ?? true}
            onChange={(_, data) => update("think", data.checked)}
          />
        </SettingField>

        <SettingField
          label="Grammar"
          info="Constrains the reply to a GBNF grammar, for example to force JSON or a fixed set of answers. Empty means unconstrained."
          disabledReason={rejectedReason(caps.grammarString)}
        >
          <Textarea
            className="model-settings__textarea"
            disabled={isRejected(caps.grammarString)}
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
                warning={warnings.ngl}
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
                warning={warnings.spec}
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
                warning={warnings.draftModel}
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

      <Flex direction="column" gap="s">
        {/* Cancel stays enabled during a scan. Every other action waits for the one in progress. */}
        <Flex gap="s" wrap>
          {saveButtons.map(renderButton)}
        </Flex>
      </Flex>
    </div>
  );
}

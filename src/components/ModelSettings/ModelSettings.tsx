import { Button, Divider, Dropdown, Field, Option } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { getModelCapabilities } from "../../services/models";
import { useModelStore } from "../../stores/modelStore";
import type { ModelCapabilities } from "../../types";
import { capabilityMap } from "../../utils/capabilityStatus";
import { settingWarnings } from "../../utils/modelCapabilities";
import {
  draftModelDisabledReason,
  engineOf,
  loadSettingDisabledReason,
  modelSettingsKey,
} from "../../utils/modelSettings";
import { settingsButtons } from "../../utils/settingsButtons";
import { ConfirmDialog } from "../ui/ConfirmDialog/ConfirmDialog";
import { Flex } from "../ui/Flex/Flex";
import SettingsActionButton from "./SettingsActionButton";
import AdvancedSection from "./sections/AdvancedSection";
import GenerationSection from "./sections/GenerationSection";
import LoadSection from "./sections/LoadSection";
import ModelFactsCard from "./sections/ModelFactsCard";
import SamplerSection from "./sections/SamplerSection";
import ScanSection from "./sections/ScanSection";
import SystemPromptSection from "./sections/SystemPromptSection";
import type { ActionState, SettingReasons } from "./sections/types";
import { useCapabilityScan } from "./useCapabilityScan";
import { useModelSettingsForm } from "./useModelSettingsForm";
import "./ModelSettings.css";

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
  const [confirmingReset, setConfirmingReset] = useState(false);
  const form = useModelSettingsForm(displayModel ?? "", settingsKey ?? "");
  const { settings, pending } = form;
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
  const reasons: SettingReasons = {
    compute: loadSettingDisabledReason("compute", engine, compute),
    nctx: loadSettingDisabledReason("nctx", engine, compute),
    ngl: loadSettingDisabledReason("ngl", engine, compute),
    spec: loadSettingDisabledReason("spec", engine, compute),
    draftModel: draftModelDisabledReason(engine, settings.specType),
  };

  const caps = capabilityMap(scan.entries);
  const buttons = settingsButtons({
    loadedModel: activeModelId,
    selectedModel: displayModel,
    scanning: scan.phase === "scanning",
  });
  // Any save or scan waits while another one runs, including a scan of another model.
  const blocked = pending !== null || scan.busy;
  const actions: ActionState = {
    pending,
    blocked,
    runAction: {
      save: () => form.save(),
      saveAndLoad: () => form.saveAndLoad(),
      scan: () => scan.start(),
      reloadAndScan: () => scan.reloadAndScan(),
      cancelScan: scan.cancel,
    },
  };

  const saveButtons = buttons.filter((b) => b.action === "save" || b.action === "saveAndLoad");
  const scanButtons = buttons.filter((b) => b.action !== "save" && b.action !== "saveAndLoad");

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

      <ModelFactsCard
        capabilities={capabilities}
        capabilitiesError={capabilitiesError}
        caps={caps}
      />

      <Divider />

      <ScanSection scan={scan} scanButtons={scanButtons} actions={actions} />

      <Divider />

      <LoadSection form={form} compute={compute} reasons={reasons} warnings={warnings} />

      <Divider />

      <SamplerSection form={form} caps={caps} />

      <Divider />

      <GenerationSection form={form} caps={caps} capabilities={capabilities} />

      <Divider />

      <SystemPromptSection form={form} />

      <AdvancedSection form={form} reasons={reasons} warnings={warnings} />

      <Flex direction="column" gap="s">
        {/* Cancel stays enabled during a scan. Every other action waits for the one in progress. */}
        <Flex gap="s" wrap>
          {saveButtons.map((button) => (
            <SettingsActionButton key={button.action} button={button} actions={actions} />
          ))}
          <Button
            appearance="secondary"
            disabled={blocked}
            onClick={() => setConfirmingReset(true)}
          >
            Reset to defaults
          </Button>
        </Flex>
      </Flex>

      {confirmingReset && (
        <ConfirmDialog
          title="Reset model settings"
          message={
            <>
              Delete the saved settings for <strong>{displayModel}</strong> and restore the
              defaults? This cannot be undone.
            </>
          }
          confirmLabel="Reset"
          onConfirm={() => {
            setConfirmingReset(false);
            void form.reset();
          }}
          onCancel={() => setConfirmingReset(false)}
        />
      )}
    </div>
  );
}

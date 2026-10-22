import {
  Button,
  Divider,
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  makeStyles,
  Option,
  Slider,
  SpinButton,
  Spinner,
  Subtitle1,
  Switch,
  Text,
  Textarea,
  Toast,
  ToastTitle,
  tokens,
  useToastController,
} from "@fluentui/react-components";
import { SaveRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import * as db from "../services/database";
import { defaultSettings, useModelStore } from "../stores/modelStore";
import type { GenerationSettings } from "../types";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  sliderRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
  },
  slider: {
    flex: 1,
    minWidth: 0,
  },
  sliderValue: {
    minWidth: "48px",
    textAlign: "right",
  },
  fullWidth: {
    width: "100%",
  },
  textarea: {
    width: "100%",
    minHeight: "120px",
  },
});

export default function ModelSettings() {
  const styles = useStyles();
  const { dispatchToast } = useToastController("app-toaster");
  const activeModelId = useModelStore((s) => s.activeModelId);
  const downloadedModels = useModelStore((s) => s.models);

  // Local model selection — defaults to the active model
  const [selectedModel, setSelectedModel] = useState<string | null>(activeModelId);
  const displayModel = selectedModel ?? activeModelId;

  // Keep in sync when activeModelId changes externally (e.g. model loaded)
  useEffect(() => {
    if (activeModelId && !selectedModel) {
      setSelectedModel(activeModelId);
    }
  }, [activeModelId, selectedModel]);

  const [settings, setSettings] = useState<GenerationSettings>({
    ...defaultSettings,
  });
  const [saving, setSaving] = useState(false);

  // Load saved settings whenever the selected model changes
  useEffect(() => {
    if (!displayModel) return;
    db.loadModelSettings(displayModel)
      .then((saved) => {
        if (saved) {
          setSettings({ ...defaultSettings, ...JSON.parse(saved) });
        } else {
          setSettings({ ...defaultSettings });
        }
      })
      .catch(() => {});
  }, [displayModel]);

  const handleSave = useCallback(async () => {
    if (!displayModel) return;
    setSaving(true);
    let saved = false;
    try {
      await db.saveModelSettings(displayModel, JSON.stringify(settings));
      saved = true;
    } catch (err) {
      console.error("Failed to save model settings:", err);
    }
    setSaving(false);
    if (saved) {
      dispatchToast(
        <Toast>
          <ToastTitle>Model settings saved</ToastTitle>
        </Toast>,
        { intent: "success" },
      );
    }
  }, [displayModel, settings, dispatchToast]);

  const update = <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (!displayModel) return null;

  const temperature = settings.temperature ?? 0.7;
  const topP = settings.topP ?? 0.9;
  const minP = settings.minP ?? 0.05;

  return (
    <div className={styles.root}>
      {downloadedModels.length > 0 && (
        <Field label="Model">
          <Dropdown
            className={styles.fullWidth}
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

      {activeModelId && displayModel !== activeModelId && (
        <MessageBar intent="warning">
          <MessageBarBody>
            Editing settings for a model not currently loaded on the server.
          </MessageBarBody>
        </MessageBar>
      )}

      <section className={styles.section}>
        <Subtitle1>Sampler</Subtitle1>

        <Field label="Temperature">
          <div className={styles.sliderRow}>
            <Slider
              className={styles.slider}
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(_, data) => update("temperature", data.value)}
            />
            <Text className={styles.sliderValue}>{temperature.toFixed(1)}</Text>
          </div>
        </Field>

        <Field label="Top P">
          <div className={styles.sliderRow}>
            <Slider
              className={styles.slider}
              min={0}
              max={1}
              step={0.05}
              value={topP}
              onChange={(_, data) => update("topP", data.value)}
            />
            <Text className={styles.sliderValue}>{topP.toFixed(2)}</Text>
          </div>
        </Field>

        <Field label="Top K">
          <SpinButton
            value={settings.topK ?? 40}
            min={1}
            max={100}
            onChange={(_, data) => {
              if (data.value != null) update("topK", data.value);
            }}
          />
        </Field>

        <Field label="Min P">
          <div className={styles.sliderRow}>
            <Slider
              className={styles.slider}
              min={0}
              max={1}
              step={0.01}
              value={minP}
              onChange={(_, data) => update("minP", data.value)}
            />
            <Text className={styles.sliderValue}>{minP.toFixed(2)}</Text>
          </div>
        </Field>

        <Field label="Repetition Penalty">
          <SpinButton
            value={settings.repetitionPenalty ?? 1.1}
            min={1}
            max={2}
            step={0.1}
            onChange={(_, data) => {
              if (data.value != null) update("repetitionPenalty", data.value);
            }}
          />
        </Field>
      </section>

      <Divider />

      <section className={styles.section}>
        <Subtitle1>Generation</Subtitle1>

        <Field label="Max Tokens">
          <SpinButton
            value={settings.maxTokens ?? 2048}
            min={256}
            max={32768}
            step={256}
            onChange={(_, data) => {
              if (data.value != null) update("maxTokens", data.value);
            }}
          />
        </Field>

        <Field label="Context Window">
          <SpinButton
            value={settings.nctx ?? 4096}
            min={512}
            max={131072}
            step={512}
            onChange={(_, data) => {
              if (data.value != null) update("nctx", data.value);
            }}
          />
        </Field>

        <Switch
          label="Think Mode"
          checked={settings.think ?? true}
          onChange={(_, data) => update("think", data.checked)}
        />
      </section>

      <Divider />

      <section className={styles.section}>
        <Subtitle1>System Prompt</Subtitle1>
        <Textarea
          className={styles.textarea}
          value={settings.systemPrompt ?? ""}
          onChange={(_, data) => update("systemPrompt", data.value)}
          placeholder="Optional system prompt…"
        />
      </section>

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

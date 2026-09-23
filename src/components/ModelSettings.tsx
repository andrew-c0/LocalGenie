import {
  Button,
  Divider,
  Dropdown,
  Option,
  Slider,
  Spinner,
  Switch,
  Toast,
  ToastTitle,
  useToastController,
} from "@fluentui/react-components";
import { SaveRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import * as db from "../services/database";
import { defaultSettings, useModelStore } from "../stores/modelStore";
import type { GenerationSettings } from "../types";

export default function ModelSettings() {
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

  return (
    <>
      {/* ── Model Picker ────────────────────────── */}
      {downloadedModels.length > 0 && (
        <div className="ms-model-picker-group">
          <div className="ms-model-label">Model</div>
          <Dropdown
            value={displayModel ?? "Select a model…"}
            selectedOptions={displayModel ? [displayModel] : []}
            onOptionSelect={(_, data) => {
              if (data.optionValue) setSelectedModel(data.optionValue);
            }}
            className="ms-full-width"
          >
            {downloadedModels.map((m) => (
              <Option key={m.name} value={m.name}>
                {m.name}
              </Option>
            ))}
          </Dropdown>
        </div>
      )}

      {displayModel && activeModelId && displayModel !== activeModelId && (
        <div className="ms-warn-banner">
          ⚠ Editing settings for a model not currently loaded on the server.
        </div>
      )}

      {/* ── Sampler Settings ────────────────────── */}
      <div className="settings-section">
        <div className="settings-section-title">Sampler</div>

        <div className="settings-row">
          <span className="settings-label">Temperature</span>
          <div className="ms-slider-row">
            <Slider
              min={0}
              max={2}
              step={0.1}
              value={settings.temperature ?? 0.7}
              onChange={(_, data) => update("temperature", data.value)}
              className="ms-slider"
            />
            <span className="ms-slider-value">{(settings.temperature ?? 0.7).toFixed(1)}</span>
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">Top P</span>
          <div className="ms-slider-row">
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={settings.topP ?? 0.9}
              onChange={(_, data) => update("topP", data.value)}
              className="ms-slider"
            />
            <span className="ms-slider-value">{(settings.topP ?? 0.9).toFixed(2)}</span>
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">Top K</span>
          <input
            className="settings-input"
            type="number"
            value={settings.topK ?? 40}
            onChange={(e) => update("topK", Number(e.target.value))}
            min={1}
            max={100}
          />
        </div>

        <div className="settings-row">
          <span className="settings-label">Min P</span>
          <div className="ms-slider-row">
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={settings.minP ?? 0.05}
              onChange={(_, data) => update("minP", data.value)}
              className="ms-slider"
            />
            <span className="ms-slider-value">{(settings.minP ?? 0.05).toFixed(2)}</span>
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">Repetition Penalty</span>
          <input
            className="settings-input"
            type="number"
            value={settings.repetitionPenalty ?? 1.1}
            onChange={(e) => update("repetitionPenalty", Number(e.target.value))}
            min={1}
            max={2}
            step={0.1}
          />
        </div>
      </div>

      <Divider className="divider-vertical" />

      {/* ── Generation Settings ─────────────────── */}
      <div className="settings-section">
        <div className="settings-section-title">Generation</div>

        <div className="settings-row">
          <span className="settings-label">Max Tokens</span>
          <input
            className="settings-input"
            type="number"
            value={settings.maxTokens ?? 2048}
            onChange={(e) => update("maxTokens", Number(e.target.value))}
            min={256}
            max={32768}
            step={256}
          />
        </div>

        <div className="settings-row">
          <span className="settings-label">Context Window</span>
          <input
            className="settings-input"
            type="number"
            value={settings.nctx ?? 4096}
            onChange={(e) => update("nctx", Number(e.target.value))}
            min={512}
            max={131072}
            step={512}
          />
        </div>

        <div className="settings-row">
          <span className="settings-label">Think Mode</span>
          <Switch
            checked={settings.think ?? true}
            onChange={(_, data) => update("think", data.checked)}
          />
        </div>
      </div>

      <Divider className="divider-vertical" />

      {/* ── System Prompt ───────────────────────── */}
      <div className="settings-section">
        <div className="settings-section-title">System Prompt</div>
        <textarea
          className="ms-sys-prompt"
          value={settings.systemPrompt ?? ""}
          onChange={(e) => update("systemPrompt", e.target.value)}
          placeholder="Optional system prompt…"
        />
      </div>

      <Button
        appearance="primary"
        icon={saving ? <Spinner size="tiny" /> : <SaveRegular />}
        onClick={handleSave}
        disabled={saving}
        className="ms-save-btn"
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </>
  );
}

import {
  Button,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Field,
  Input,
  OverlayDrawer,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import * as db from "../../../services/database";
import { useChatStore } from "../../../stores/chatStore";
import { defaultSettings, useModelStore } from "../../../stores/modelStore";
import type { ChatSettingsOverrides, StoredModelSettings } from "../../../types";
import { cleanOverrides } from "../../../utils/chatOverrides";
import { modelSettingsKey } from "../../../utils/modelSettings";
import { withSystemBlocks } from "../../../utils/systemPrompt";
import SystemPromptEditor from "../../ModelSettings/SystemPromptEditor/SystemPromptEditor";
import { ConfirmDialog } from "../../ui/ConfirmDialog/ConfirmDialog";
import { Meta } from "../../ui/Typography/Typography";
import "./ChatSettingsDrawer.css";

type NumberKey = Exclude<keyof ChatSettingsOverrides, "systemBlocks">;

interface NumberField {
  key: NumberKey;
  label: string;
  integer: boolean;
}

/** The number settings a chat can override, in the order the drawer shows them. */
const NUMBER_FIELDS: NumberField[] = [
  { key: "temperature", label: "Temperature", integer: false },
  { key: "topP", label: "Top P", integer: false },
  { key: "topK", label: "Top K", integer: true },
  { key: "minP", label: "Min P", integer: false },
  { key: "repetitionPenalty", label: "Repetition penalty", integer: false },
  { key: "maxTokens", label: "Max tokens", integer: true },
  { key: "seed", label: "Seed", integer: true },
];

/** The model's value as text, or the server default when the model does not set it. */
function shownValue(value: number | undefined): string {
  return value === undefined ? "server default" : String(value);
}

interface ChatSettingsDrawerProps {
  sessionId: string;
  onClose: () => void;
}

/**
 * Settings for one conversation, on the right of the chat. Each field is empty when the chat uses
 * the model's value, which is shown as a hint. The system prompt, when set here, replaces the
 * model's for this chat. Nothing changes until Save.
 */
export function ChatSettingsDrawer({ sessionId, onClose }: ChatSettingsDrawerProps) {
  const activeModelId = useModelStore((s) => s.activeModelId);
  const saved = useChatStore((s) => s.sessions.find((x) => x.id === sessionId)?.settingsOverrides);
  const [draft, setDraft] = useState<ChatSettingsOverrides>(() => cleanOverrides(saved ?? {}));
  const [modelSettings, setModelSettings] = useState<StoredModelSettings>({ ...defaultSettings });
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  // The model's own values, shown as hints. Reloaded when the active model changes.
  useEffect(() => {
    if (!activeModelId) {
      setModelSettings({ ...defaultSettings });
      return;
    }
    let cancelled = false;
    db.loadModelSettings(modelSettingsKey(activeModelId))
      .then((loaded) => {
        if (!cancelled) setModelSettings(withSystemBlocks({ ...defaultSettings, ...loaded }));
      })
      .catch(() => {
        if (!cancelled) setModelSettings({ ...defaultSettings });
      });
    return () => {
      cancelled = true;
    };
  }, [activeModelId]);

  const savedJson = JSON.stringify(cleanOverrides(saved ?? {}));
  const dirty = JSON.stringify(cleanOverrides(draft)) !== savedJson;

  const requestClose = () => {
    if (dirty) setConfirmingDiscard(true);
    else onClose();
  };

  const setNumber = (field: NumberField, text: string) => {
    setDraft((prev) => {
      const next = { ...prev };
      if (text.trim() === "") {
        delete next[field.key];
        return next;
      }
      const value = Number(text);
      if (!Number.isFinite(value)) return prev;
      next[field.key] = field.integer ? Math.trunc(value) : value;
      return next;
    });
  };

  const modelPrompt = modelSettings.systemBlocks ?? [];
  const promptOverride = draft.systemBlocks;

  const save = () => {
    const next = cleanOverrides(draft);
    useChatStore
      .getState()
      .setSessionOverrides(sessionId, Object.keys(next).length > 0 ? next : undefined);
    onClose();
  };

  return (
    <>
      <OverlayDrawer
        open
        position="end"
        size="medium"
        onOpenChange={(_, data) => {
          if (!data.open) requestClose();
        }}
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button
                appearance="subtle"
                icon={<DismissRegular />}
                aria-label="Close chat settings"
                onClick={requestClose}
              />
            }
          >
            Chat settings
          </DrawerHeaderTitle>
        </DrawerHeader>

        <DrawerBody>
          <div className="chat-settings">
            <Meta>
              These settings apply to this conversation only. An empty field uses the model's value,
              shown under it.
            </Meta>

            {NUMBER_FIELDS.map((field) => {
              const current = draft[field.key];
              return (
                <Field
                  key={field.key}
                  label={field.label}
                  hint={`Model: ${shownValue(modelSettings[field.key])}`}
                >
                  <Input
                    type="number"
                    value={current === undefined ? "" : String(current)}
                    placeholder={shownValue(modelSettings[field.key])}
                    onChange={(_, data) => setNumber(field, data.value)}
                  />
                </Field>
              );
            })}

            <section className="chat-settings__prompt">
              <Field
                label="System prompt"
                hint={promptOverride === undefined ? "Uses the model's system prompt." : undefined}
              >
                {promptOverride === undefined ? (
                  <Button
                    appearance="secondary"
                    onClick={() => setDraft((prev) => ({ ...prev, systemBlocks: modelPrompt }))}
                  >
                    Set a system prompt for this chat
                  </Button>
                ) : (
                  <>
                    <SystemPromptEditor
                      blocks={promptOverride}
                      onChange={(blocks) => setDraft((prev) => ({ ...prev, systemBlocks: blocks }))}
                    />
                    <Button
                      appearance="subtle"
                      onClick={() =>
                        setDraft((prev) => {
                          const next = { ...prev };
                          delete next.systemBlocks;
                          return next;
                        })
                      }
                    >
                      Use the model's system prompt
                    </Button>
                  </>
                )}
              </Field>
            </section>

            <div className="chat-settings__actions">
              <Button
                appearance="secondary"
                onClick={() => setDraft({})}
                disabled={Object.keys(draft).length === 0}
              >
                Reset to model settings
              </Button>
              <Button
                appearance="secondary"
                onClick={() => setDraft(cleanOverrides(saved ?? {}))}
                disabled={!dirty}
              >
                Discard changes
              </Button>
              <Button appearance="primary" onClick={save} disabled={!dirty}>
                Save
              </Button>
            </div>
          </div>
        </DrawerBody>
      </OverlayDrawer>

      {confirmingDiscard && (
        <ConfirmDialog
          title="Discard changes?"
          message="Changes made since the last save will be lost."
          confirmLabel="Discard"
          onConfirm={onClose}
          onCancel={() => setConfirmingDiscard(false)}
        />
      )}
    </>
  );
}

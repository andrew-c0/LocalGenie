import {
  Button,
  Dropdown,
  Field,
  Input,
  Option,
  Radio,
  RadioGroup,
  SpinButton,
  Textarea,
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowDownRegular,
  ArrowUpRegular,
  DeleteRegular,
  DismissRegular,
  SaveRegular,
} from "@fluentui/react-icons";
import { useState } from "react";
import { deleteBenchmarkSuite, saveBenchmarkSuite } from "../../../services/benchmark";
import type {
  AttachmentKind,
  BenchmarkFile,
  BenchmarkPrompt,
  BenchmarkSuite,
  BenchmarkSuiteMode,
} from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";
import { ConfirmDialog } from "../../ui/ConfirmDialog/ConfirmDialog";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { BodyStrong, Meta } from "../../ui/Typography/Typography";
import { LibraryFileButtons, LibraryFileList } from "../LibraryFiles/LibraryFiles";
import { useFileImports } from "../LibraryFiles/useFileImports";
import "./SuiteEditor.css";

const MAX_STEPS = 50;
const MAX_FILES_PER_STEP = 10;
const MAX_WARMUP_RUNS = 10;
const MAX_REPETITIONS = 20;

interface EditorStep {
  id: string;
  promptId: string;
  /** Extra files for this step. The prompt's own files are shown separately. */
  files: BenchmarkFile[];
}

interface SuiteEditorProps {
  /** The saved suite, or null for a new one. */
  initial: BenchmarkSuite | null;
  /** The prompt library, for the step pickers. */
  prompts: BenchmarkPrompt[];
  onSaved: (suite: BenchmarkSuite) => void;
  onDeleted: (id: string) => void;
}

function stepsOf(suite: BenchmarkSuite | null): EditorStep[] {
  return (suite?.steps ?? []).map((s) => ({ id: s.id, promptId: s.promptId, files: s.files }));
}

/**
 * Editor for one suite (a test run definition): name, mode, warmup and repetitions, and the
 * ordered steps. Each step is a prompt plus optional extra files.
 * Rendered with a `key` per suite, so switching suites starts from a clean form.
 */
export function SuiteEditor({ initial, prompts, onSaved, onDeleted }: SuiteEditorProps) {
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [mode, setMode] = useState<BenchmarkSuiteMode>(initial?.mode ?? "conversation");
  const [warmupRuns, setWarmupRuns] = useState(initial?.warmupRuns ?? 1);
  const [repetitions, setRepetitions] = useState(initial?.repetitions ?? 3);
  const [steps, setSteps] = useState<EditorStep[]>(() => stepsOf(initial));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const imports = useFileImports();

  const promptById = (promptId: string) => prompts.find((p) => p.id === promptId);

  const updateStep = (index: number, change: (step: EditorStep) => EditorStep) => {
    setSteps((list) => list.map((step, i) => (i === index ? change(step) : step)));
  };

  const moveStep = (index: number, delta: number) => {
    setSteps((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addStep = () => {
    setFormError(null);
    setSteps((list) => [
      ...list,
      { id: crypto.randomUUID(), promptId: prompts[0]?.id ?? "", files: [] },
    ]);
  };

  const removeStep = (index: number) => {
    setSteps((list) => list.filter((_, i) => i !== index));
  };

  const addStepFile = async (index: number, kind: AttachmentKind) => {
    setFormError(null);
    try {
      const file = await imports.importFile(kind);
      if (file) updateStep(index, (step) => ({ ...step, files: [...step.files, file] }));
    } catch (e) {
      setFormError(errorMessage(e, "Could not add the file."));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setFormError("Give the suite a name.");
      return;
    }
    if (steps.length === 0) {
      setFormError("Add at least one step.");
      return;
    }
    if (steps.some((step) => !step.promptId)) {
      setFormError("Choose a prompt for every step.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const saved = await saveBenchmarkSuite({
        id,
        name: name.trim(),
        description: description.trim() || null,
        mode,
        warmupRuns,
        repetitions,
        steps: steps.map((step) => ({
          id: step.id,
          promptId: step.promptId,
          fileIds: step.files.map((f) => f.id),
        })),
      });
      imports.settle(saved.steps.flatMap((step) => step.files.map((f) => f.id)));
      toast.success("Suite saved", saved.name);
      onSaved(saved);
    } catch (e) {
      setFormError(errorMessage(e, "Could not save the suite."));
    } finally {
      setSaving(false);
    }
  };

  /** Put the form back to the saved suite and drop files copied in this editor. */
  const handleDiscard = () => {
    imports.discardAll();
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setMode(initial?.mode ?? "conversation");
    setWarmupRuns(initial?.warmupRuns ?? 1);
    setRepetitions(initial?.repetitions ?? 3);
    setSteps(stepsOf(initial));
    setFormError(null);
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      await deleteBenchmarkSuite(id);
      toast.success("Suite deleted", initial?.name);
      onDeleted(id);
    } catch (e) {
      setFormError(errorMessage(e, "Could not delete the suite."));
    }
  };

  return (
    <div className="suite-editor">
      {formError && <ErrorBanner message={formError} />}

      <Field label="Name" required>
        <Input value={name} onChange={(_, d) => setName(d.value)} maxLength={120} />
      </Field>

      <Field label="Description">
        <Textarea
          value={description}
          onChange={(_, d) => setDescription(d.value)}
          resize="vertical"
          rows={2}
        />
      </Field>

      <Field label="How the steps run">
        <RadioGroup
          value={mode}
          onChange={(_, d) => setMode(d.value as BenchmarkSuiteMode)}
          aria-label="How the steps run"
        >
          <Radio
            value="conversation"
            label="Conversation: steps share one chat history, as a real chat does"
          />
          <Radio value="independent" label="Independent: each step is a fresh request" />
        </RadioGroup>
      </Field>

      <div className="suite-editor__counts">
        <Field
          label="Warmup runs"
          hint="Full passes before the timed ones. Their results are not counted."
        >
          <SpinButton
            min={0}
            max={MAX_WARMUP_RUNS}
            value={warmupRuns}
            onChange={(_, d) => setWarmupRuns(d.value ?? 0)}
          />
        </Field>
        <Field label="Repetitions" hint="Timed passes. Compare shows the mean of these.">
          <SpinButton
            min={1}
            max={MAX_REPETITIONS}
            value={repetitions}
            onChange={(_, d) => setRepetitions(d.value ?? 1)}
          />
        </Field>
      </div>

      <section className="suite-editor__section">
        <div className="suite-editor__steps-header">
          <BodyStrong>Steps</BodyStrong>
          <Button
            appearance="secondary"
            size="small"
            icon={<AddRegular />}
            onClick={addStep}
            disabled={prompts.length === 0 || steps.length >= MAX_STEPS}
          >
            Add step
          </Button>
        </div>
        {prompts.length === 0 && (
          <Meta>Create prompts in the Prompt Library before building a suite.</Meta>
        )}

        {steps.length === 0 && <Meta>No steps yet.</Meta>}

        <ol className="suite-editor__steps">
          {steps.map((step, index) => {
            const prompt = promptById(step.promptId);
            return (
              <li key={step.id} className="suite-editor__step">
                <div className="suite-editor__step-header">
                  <BodyStrong>Step {index + 1}</BodyStrong>
                  <div className="suite-editor__step-actions">
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<ArrowUpRegular />}
                      aria-label={`Move step ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => moveStep(index, -1)}
                    />
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<ArrowDownRegular />}
                      aria-label={`Move step ${index + 1} down`}
                      disabled={index === steps.length - 1}
                      onClick={() => moveStep(index, 1)}
                    />
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<DismissRegular />}
                      aria-label={`Remove step ${index + 1}`}
                      onClick={() => removeStep(index)}
                    />
                  </div>
                </div>

                <Dropdown
                  aria-label={`Prompt for step ${index + 1}`}
                  value={prompt?.name ?? ""}
                  selectedOptions={[step.promptId]}
                  onOptionSelect={(_, d) => {
                    if (d.optionValue) {
                      updateStep(index, (s) => ({ ...s, promptId: d.optionValue ?? s.promptId }));
                    }
                  }}
                >
                  {prompts.map((p) => (
                    <Option key={p.id} value={p.id} text={p.name}>
                      {p.name}
                    </Option>
                  ))}
                </Dropdown>

                {prompt && prompt.files.length > 0 && (
                  <div className="suite-editor__from-prompt">
                    <Meta>From the prompt</Meta>
                    <LibraryFileList
                      files={prompt.files}
                      label={`Files of step ${index + 1}'s prompt`}
                    />
                  </div>
                )}

                <Field
                  label={`Extra files for this step (${step.files.length} of ${MAX_FILES_PER_STEP})`}
                >
                  <LibraryFileButtons
                    count={step.files.length}
                    max={MAX_FILES_PER_STEP}
                    onPick={(kind) => void addStepFile(index, kind)}
                  />
                </Field>
                <LibraryFileList
                  files={step.files}
                  label={`Extra files for step ${index + 1}`}
                  onRemove={(fileId) =>
                    updateStep(index, (s) => ({
                      ...s,
                      files: s.files.filter((f) => f.id !== fileId),
                    }))
                  }
                />
              </li>
            );
          })}
        </ol>
      </section>

      {initial && (
        <Meta>
          Run {initial.runCount} {initial.runCount === 1 ? "time" : "times"} since the last save
        </Meta>
      )}

      <div className="suite-editor__actions">
        {initial && (
          <Button
            appearance="subtle"
            icon={<DeleteRegular />}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        )}
        <Button appearance="secondary" onClick={handleDiscard} disabled={saving}>
          Discard changes
        </Button>
        <Button
          appearance="primary"
          icon={<SaveRegular />}
          onClick={() => void handleSave()}
          disabled={saving}
        >
          Save suite
        </Button>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this suite?"
          message="The suite and its steps are removed, and so are the extra files only its steps used. Its past runs keep their records."
          confirmLabel="Delete suite"
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

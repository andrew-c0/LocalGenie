import { Button, Field, Input, Radio, RadioGroup, Textarea } from "@fluentui/react-components";
import { DeleteRegular, DismissRegular, SaveRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { deleteBenchmarkPrompt, saveBenchmarkPrompt } from "../../../services/benchmark";
import type {
  AttachmentKind,
  BenchmarkFile,
  BenchmarkMatchRule,
  BenchmarkPrompt,
} from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";
import { ConfirmDialog } from "../../ui/ConfirmDialog/ConfirmDialog";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Meta } from "../../ui/Typography/Typography";
import { LibraryFileButtons, LibraryFileList } from "../LibraryFiles/LibraryFiles";
import { useFileImports } from "../LibraryFiles/useFileImports";
import "./PromptEditor.css";

/** Most files a prompt can carry. Matches the backend limit. */
const MAX_FILES = 10;

interface PromptEditorProps {
  /** The saved prompt, or null for a new one. */
  initial: BenchmarkPrompt | null;
  onSaved: (prompt: BenchmarkPrompt) => void;
  onDeleted: (id: string) => void;
}

/**
 * Editor for one prompt: name, description, keywords with their rule, and files. Files are copied
 * into the library as soon as they are picked; ones not saved are discarded when the editor closes.
 * Rendered with a `key` per prompt, so switching prompts starts from a clean form.
 */
export function PromptEditor({ initial, onSaved, onDeleted }: PromptEditorProps) {
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [matchRule, setMatchRule] = useState<BenchmarkMatchRule>(initial?.matchRule ?? "any");
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [files, setFiles] = useState<BenchmarkFile[]>(initial?.files ?? []);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const imports = useFileImports();

  const addKeyword = () => {
    const keyword = keywordDraft.trim();
    setKeywordDraft("");
    if (!keyword) return;
    const lower = keyword.toLowerCase();
    if (keywords.some((k) => k.toLowerCase() === lower)) return;
    setKeywords([...keywords, keyword]);
  };

  const addFile = async (kind: AttachmentKind) => {
    setFormError(null);
    try {
      const file = await imports.importFile(kind);
      if (file) setFiles((list) => [...list, file]);
    } catch (e) {
      setFormError(errorMessage(e, "Could not add the file."));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setFormError("Give the prompt a name.");
      return;
    }
    if (!text.trim()) {
      setFormError("Write the prompt text that is sent to the model.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const saved = await saveBenchmarkPrompt({
        id,
        name: name.trim(),
        description: description.trim() || null,
        text: text.trim(),
        matchRule,
        keywords,
        fileIds: files.map((f) => f.id),
      });
      imports.settle(saved.files.map((f) => f.id));
      toast.success("Prompt saved", saved.name);
      onSaved(saved);
    } catch (e) {
      setFormError(errorMessage(e, "Could not save the prompt."));
    } finally {
      setSaving(false);
    }
  };

  /** Put the form back to the saved prompt and drop files copied in this editor. */
  const handleDiscard = () => {
    imports.discardAll();
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setText(initial?.text ?? "");
    setMatchRule(initial?.matchRule ?? "any");
    setKeywords(initial?.keywords ?? []);
    setFiles(initial?.files ?? []);
    setFormError(null);
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      await deleteBenchmarkPrompt(id);
      toast.success("Prompt deleted", initial?.name);
      onDeleted(id);
    } catch (e) {
      setFormError(errorMessage(e, "Could not delete the prompt."));
    }
  };

  return (
    <div className="prompt-editor">
      {formError && <ErrorBanner message={formError} />}

      <Field label="Name" required>
        <Input value={name} onChange={(_, d) => setName(d.value)} maxLength={120} />
      </Field>

      <Field label="Prompt text" required hint="Sent to the model as the user message.">
        <Textarea value={text} onChange={(_, d) => setText(d.value)} resize="vertical" rows={4} />
      </Field>

      <Field label="Description">
        <Textarea
          value={description}
          onChange={(_, d) => setDescription(d.value)}
          resize="vertical"
          rows={2}
        />
      </Field>

      <section className="prompt-editor__section">
        <Field
          label="Expected keywords"
          hint="A reply passes when its words match the keywords, as whole words, ignoring case."
        >
          <div className="prompt-editor__keyword-entry">
            <Input
              value={keywordDraft}
              placeholder="Type a keyword and press Enter"
              onChange={(_, d) => setKeywordDraft(d.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
            />
            <Button appearance="secondary" onClick={addKeyword}>
              Add
            </Button>
          </div>
        </Field>

        {keywords.length > 0 && (
          <ul className="prompt-editor__keywords" aria-label="Keywords">
            {keywords.map((keyword) => (
              <li key={keyword} className="prompt-editor__keyword">
                <span>{keyword}</span>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<DismissRegular />}
                  aria-label={`Remove ${keyword}`}
                  onClick={() => setKeywords(keywords.filter((k) => k !== keyword))}
                />
              </li>
            ))}
          </ul>
        )}

        <RadioGroup
          layout="horizontal"
          value={matchRule}
          onChange={(_, d) => setMatchRule(d.value as BenchmarkMatchRule)}
          aria-label="Keyword rule"
        >
          <Radio value="any" label="A reply needs any keyword" />
          <Radio value="all" label="A reply needs every keyword" />
        </RadioGroup>
      </section>

      <section className="prompt-editor__section">
        <Field label={`Files (${files.length} of ${MAX_FILES})`}>
          <LibraryFileButtons
            count={files.length}
            max={MAX_FILES}
            onPick={(kind) => void addFile(kind)}
          />
        </Field>
        <LibraryFileList
          files={files}
          label="Files"
          onRemove={(fileId) => setFiles((list) => list.filter((f) => f.id !== fileId))}
        />
      </section>

      {initial && (
        <Meta>
          Run {initial.runCount} {initial.runCount === 1 ? "time" : "times"} since the last save
        </Meta>
      )}

      <div className="prompt-editor__actions">
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
          Save prompt
        </Button>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this prompt?"
          message="The prompt and its files are removed from the library. Past runs keep their records. A prompt used by a suite cannot be deleted."
          confirmLabel="Delete prompt"
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

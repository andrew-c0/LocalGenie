import { useState } from "react";
import { LibraryPanel } from "../../../components/benchmark/LibraryPanel/LibraryPanel";
import { PromptEditor } from "../../../components/benchmark/PromptEditor/PromptEditor";
import { EditorDialog } from "../../../components/ui/EditorDialog/EditorDialog";
import { useBenchmarkPrompts } from "./useBenchmarkPrompts";

/** What the editor dialog is open on: `id` null for a new prompt, else the saved prompt's id. */
interface EditTarget {
  id: string | null;
}

/**
 * Prompt library: saved prompts with their keywords and files. Shown as a subpage of the
 * Benchmark Suite. The list is full width; a prompt is edited in a dialog.
 */
export default function BenchmarkPrompts() {
  const { prompts, error, reload, upsert, remove } = useBenchmarkPrompts();
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [dirty, setDirty] = useState(false);

  const selected = editing?.id ? (prompts?.find((p) => p.id === editing.id) ?? null) : null;

  const closeEditor = () => {
    setEditing(null);
    setDirty(false);
  };

  return (
    <>
      <LibraryPanel
        title="Prompts"
        newLabel="New prompt"
        items={
          prompts?.map((p) => ({
            id: p.id,
            name: p.name,
            detail: `${p.keywords.length} keyword${p.keywords.length === 1 ? "" : "s"} · ${p.files.length} file${p.files.length === 1 ? "" : "s"} · run ${p.runCount}×`,
          })) ?? null
        }
        error={error}
        selectedId={editing?.id ?? null}
        emptyMessage="No prompts yet. Create one to use it in a test run."
        onNew={() => {
          setDirty(false);
          setEditing({ id: null });
        }}
        onSelect={(id) => {
          setDirty(false);
          setEditing({ id });
        }}
        onRetry={() => void reload()}
      />

      {editing && (
        <EditorDialog
          title={selected ? selected.name : "New prompt"}
          dirty={dirty}
          onClose={closeEditor}
        >
          {/* One editor per prompt: each opening starts from a clean form. */}
          <PromptEditor
            key={editing.id ?? "new"}
            initial={selected}
            onDirtyChange={setDirty}
            onSaved={(saved) => {
              upsert(saved);
              closeEditor();
            }}
            onDeleted={(id) => {
              remove(id);
              closeEditor();
            }}
          />
        </EditorDialog>
      )}
    </>
  );
}

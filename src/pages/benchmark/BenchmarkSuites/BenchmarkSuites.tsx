import { useState } from "react";
import { LibraryPanel } from "../../../components/benchmark/LibraryPanel/LibraryPanel";
import { SuiteEditor } from "../../../components/benchmark/SuiteEditor/SuiteEditor";
import { EditorDialog } from "../../../components/ui/EditorDialog/EditorDialog";
import { ErrorBanner } from "../../../components/ui/ErrorBanner/ErrorBanner";
import { useBenchmarkPrompts } from "../BenchmarkPrompts/useBenchmarkPrompts";
import { useBenchmarkSuites } from "./useBenchmarkSuites";

/** What the editor dialog is open on: `id` null for a new suite, else the saved suite's id. */
interface EditTarget {
  id: string | null;
}

/**
 * Suite editor: test runs as ordered steps, each a prompt plus optional extra files. Shown as a
 * subpage of the Benchmark Suite. The list is full width; a suite is edited in a dialog. The model
 * and compute target are chosen when a run starts.
 */
export default function BenchmarkSuites() {
  const suites = useBenchmarkSuites();
  const promptLibrary = useBenchmarkPrompts();
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [dirty, setDirty] = useState(false);

  const selected = editing?.id ? (suites.suites?.find((s) => s.id === editing.id) ?? null) : null;

  const closeEditor = () => {
    setEditing(null);
    setDirty(false);
  };

  return (
    <>
      <LibraryPanel
        title="Suites"
        newLabel="New suite"
        items={
          suites.suites?.map((s) => ({
            id: s.id,
            name: s.name,
            detail: `${s.steps.length} step${s.steps.length === 1 ? "" : "s"} · ${s.mode} · ${s.repetitions} rep${s.repetitions === 1 ? "" : "s"} · run ${s.runCount}×`,
          })) ?? null
        }
        error={suites.error}
        selectedId={editing?.id ?? null}
        emptyMessage="No suites yet. Create one to describe a test run."
        onNew={() => {
          setDirty(false);
          setEditing({ id: null });
        }}
        onSelect={(id) => {
          setDirty(false);
          setEditing({ id });
        }}
        onRetry={() => void suites.reload()}
      />

      {editing && (
        <EditorDialog
          title={selected ? selected.name : "New suite"}
          dirty={dirty}
          onClose={closeEditor}
        >
          {promptLibrary.error && <ErrorBanner message={promptLibrary.error} />}
          {/* One editor per suite: each opening starts from a clean form. */}
          <SuiteEditor
            key={editing.id ?? "new"}
            initial={selected}
            prompts={promptLibrary.prompts ?? []}
            onDirtyChange={setDirty}
            onSaved={(saved) => {
              suites.upsert(saved);
              closeEditor();
            }}
            onDeleted={(id) => {
              suites.remove(id);
              closeEditor();
            }}
          />
        </EditorDialog>
      )}
    </>
  );
}

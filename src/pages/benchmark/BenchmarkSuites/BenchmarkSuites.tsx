import { Button } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { LibraryPanel } from "../../../components/benchmark/LibraryPanel/LibraryPanel";
import { SuiteEditor } from "../../../components/benchmark/SuiteEditor/SuiteEditor";
import { ErrorBanner } from "../../../components/ui/ErrorBanner/ErrorBanner";
import { SurfaceCard } from "../../../components/ui/SurfaceCard/SurfaceCard";
import { useBenchmarkPrompts } from "../BenchmarkPrompts/useBenchmarkPrompts";
import { useBenchmarkSuites } from "./useBenchmarkSuites";

/**
 * Suite editor: test runs as ordered steps, each a prompt plus optional extra files. Shown as a
 * subpage of the Benchmark Suite. The model and compute target are chosen when a run starts.
 */
export default function BenchmarkSuites() {
  const suites = useBenchmarkSuites();
  const promptLibrary = useBenchmarkPrompts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = suites.suites?.find((s) => s.id === selectedId) ?? null;
  const showEditor = creating || selected !== null;

  const closeEditor = () => {
    setCreating(false);
    setSelectedId(null);
  };

  return (
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
      selectedId={selectedId}
      emptyMessage="No suites yet. Create one to describe a test run."
      idleMessage="Select a suite to edit it, or create a new one."
      editor={
        showEditor ? (
          <SurfaceCard
            title={selected ? selected.name : "New suite"}
            action={
              <Button
                appearance="subtle"
                icon={<DismissRegular />}
                aria-label="Close editor"
                onClick={closeEditor}
              />
            }
          >
            {promptLibrary.error && <ErrorBanner message={promptLibrary.error} />}
            {/* One editor per suite: switching suites starts from a clean form. */}
            <SuiteEditor
              key={creating ? "new" : selected?.id}
              initial={selected}
              prompts={promptLibrary.prompts ?? []}
              onSaved={(saved) => {
                suites.upsert(saved);
                setCreating(false);
                setSelectedId(saved.id);
              }}
              onDeleted={(id) => {
                suites.remove(id);
                closeEditor();
              }}
            />
          </SurfaceCard>
        ) : null
      }
      onNew={() => {
        setCreating(true);
        setSelectedId(null);
      }}
      onSelect={(id) => {
        setCreating(false);
        setSelectedId(id);
      }}
      onRetry={() => void suites.reload()}
    />
  );
}

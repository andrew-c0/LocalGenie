import { Button } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { LibraryPanel } from "../../../components/benchmark/LibraryPanel/LibraryPanel";
import { PromptEditor } from "../../../components/benchmark/PromptEditor/PromptEditor";
import { SurfaceCard } from "../../../components/ui/SurfaceCard/SurfaceCard";
import { useBenchmarkPrompts } from "./useBenchmarkPrompts";

/**
 * Prompt library: saved prompts with their keywords and files. Shown as a subpage of the
 * Benchmark Suite.
 */
export default function BenchmarkPrompts() {
  const { prompts, error, reload, upsert, remove } = useBenchmarkPrompts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = prompts?.find((p) => p.id === selectedId) ?? null;
  const showEditor = creating || selected !== null;

  const closeEditor = () => {
    setCreating(false);
    setSelectedId(null);
  };

  return (
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
      selectedId={selectedId}
      emptyMessage="No prompts yet. Create one to use it in a test run."
      idleMessage="Select a prompt to edit it, or create a new one."
      editor={
        showEditor ? (
          <SurfaceCard
            title={selected ? selected.name : "New prompt"}
            action={
              <Button
                appearance="subtle"
                icon={<DismissRegular />}
                aria-label="Close editor"
                onClick={closeEditor}
              />
            }
          >
            {/* One editor per prompt: switching prompts starts from a clean form. */}
            <PromptEditor
              key={creating ? "new" : selected?.id}
              initial={selected}
              onSaved={(saved) => {
                upsert(saved);
                setCreating(false);
                setSelectedId(saved.id);
              }}
              onDeleted={(id) => {
                remove(id);
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
      onRetry={() => void reload()}
    />
  );
}

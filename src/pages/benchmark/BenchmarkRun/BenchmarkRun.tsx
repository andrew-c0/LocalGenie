import { useState } from "react";
import { LibraryPanel } from "../../../components/benchmark/LibraryPanel/LibraryPanel";
import { SuiteRun } from "../../../components/benchmark/SuiteRun/SuiteRun";
import { SurfaceCard } from "../../../components/ui/SurfaceCard/SurfaceCard";
import { useBenchmarkSuites } from "../BenchmarkSuites/useBenchmarkSuites";

/**
 * Run: pick a saved suite and run it on the loaded model. Results are saved per step; the run
 * counter on each suite is updated when a run completes.
 */
export default function BenchmarkRun() {
  const suites = useBenchmarkSuites();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = suites.suites?.find((s) => s.id === selectedId) ?? null;

  return (
    <LibraryPanel
      title="Suites"
      items={
        suites.suites?.map((s) => ({
          id: s.id,
          name: s.name,
          detail: `${s.steps.length} step${s.steps.length === 1 ? "" : "s"} · ${s.mode} · ${s.repetitions} rep${s.repetitions === 1 ? "" : "s"} · run ${s.runCount}×`,
        })) ?? null
      }
      error={suites.error}
      selectedId={selectedId}
      editor={
        selected ? (
          <SurfaceCard title={selected.name}>
            <SuiteRun
              key={selected.id}
              suiteId={selected.id}
              onFinished={() => void suites.reload()}
            />
          </SurfaceCard>
        ) : null
      }
      emptyMessage="No suites yet. Create one in Test Runs first."
      idleMessage="Select a suite to run it on the loaded model."
      onSelect={setSelectedId}
      onRetry={() => void suites.reload()}
    />
  );
}

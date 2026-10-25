import { create } from "zustand";
import type { ComputeTarget } from "../types";
import type { CompareMetric } from "../utils/compare";

export type CompareGroupBy = "model" | "compute" | "run" | "time";

interface BenchmarkUiState {
  /** Runs ticked on the Runs tab. The Compare tab charts these. */
  selectedRunIds: string[];
  setSelectedRunIds: (ids: string[]) => void;

  /** Filters on the Runs tab. */
  runsCompute: "all" | ComputeTarget;
  runsSuite: string;
  runsModel: string;
  setRunsCompute: (value: "all" | ComputeTarget) => void;
  setRunsSuite: (value: string) => void;
  setRunsModel: (value: string) => void;

  /** Settings on the Compare tab. */
  compareMetric: CompareMetric;
  compareGroupBy: CompareGroupBy;
  setCompareMetric: (value: CompareMetric) => void;
  setCompareGroupBy: (value: CompareGroupBy) => void;
}

/**
 * State of the benchmark tabs that must survive moving between them: the ticked runs, the Runs
 * filters and the Compare settings. Not persisted: it lasts for the session.
 */
export const useBenchmarkUiStore = create<BenchmarkUiState>((set) => ({
  selectedRunIds: [],
  setSelectedRunIds: (selectedRunIds) => set({ selectedRunIds }),

  runsCompute: "all",
  runsSuite: "all",
  runsModel: "all",
  setRunsCompute: (runsCompute) => set({ runsCompute }),
  setRunsSuite: (runsSuite) => set({ runsSuite }),
  setRunsModel: (runsModel) => set({ runsModel }),

  compareMetric: "ttft",
  compareGroupBy: "model",
  setCompareMetric: (compareMetric) => set({ compareMetric }),
  setCompareGroupBy: (compareGroupBy) => set({ compareGroupBy }),
}));

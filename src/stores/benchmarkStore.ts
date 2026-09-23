import { create } from "zustand";
import type {
  BenchmarkKpis,
  BenchmarkRunSummary,
  BenchmarkSample,
  BenchmarkStatus,
  ComputeTarget,
} from "../types";

interface BenchmarkState {
  status: BenchmarkStatus;
  target: ComputeTarget;
  /** Prompt used by the prompt benchmark playground. */
  prompt: string;
  temperature: number;
  topP: number;
  seed: number | null;
  warmupRuns: number;
  timedRuns: number;
  samples: BenchmarkSample[];
  kpis: BenchmarkKpis;
  output: string;
  generatedTokens: number;
  targetTokens: number;
  runs: BenchmarkRunSummary[];
  error: string | null;

  setStatus: (status: BenchmarkStatus) => void;
  setTarget: (target: ComputeTarget) => void;
  setPrompt: (prompt: string) => void;
  setTemperature: (v: number) => void;
  setTopP: (v: number) => void;
  setSeed: (v: number | null) => void;
  setWarmupRuns: (v: number) => void;
  setTimedRuns: (v: number) => void;
  addSample: (sample: BenchmarkSample) => void;
  setKpis: (kpis: Partial<BenchmarkKpis>) => void;
  appendOutput: (chunk: string) => void;
  setGeneratedTokens: (n: number) => void;
  setTargetTokens: (n: number) => void;
  recordRun: (run: BenchmarkRunSummary) => void;
  reset: () => void;
  clearRuns: () => void;
}

const initialKpis: BenchmarkKpis = {
  ttftMs: null,
  tokensPerSec: null,
  memoryBandwidthGbps: null,
  tempC: null,
};

const initialState = {
  status: "idle" as BenchmarkStatus,
  target: "npu" as ComputeTarget,
  prompt: "",
  temperature: 0.2,
  topP: 0.9,
  seed: null as number | null,
  warmupRuns: 1,
  timedRuns: 2,
  samples: [] as BenchmarkSample[],
  kpis: initialKpis,
  output: "",
  generatedTokens: 0,
  targetTokens: 512,
  runs: [] as BenchmarkRunSummary[],
  error: null as string | null,
};

export const useBenchmarkStore = create<BenchmarkState>((set) => ({
  ...initialState,
  setStatus: (status) => set({ status }),
  setTarget: (target) => set({ target }),
  setPrompt: (prompt) => set({ prompt }),
  setTemperature: (temperature) => set({ temperature }),
  setTopP: (topP) => set({ topP }),
  setSeed: (seed) => set({ seed }),
  setWarmupRuns: (warmupRuns) => set({ warmupRuns }),
  setTimedRuns: (timedRuns) => set({ timedRuns }),
  addSample: (sample) => set((s) => ({ samples: [...s.samples.slice(-119), sample] })),
  setKpis: (kpis) => set((s) => ({ kpis: { ...s.kpis, ...kpis } })),
  appendOutput: (chunk) => set((s) => ({ output: s.output + chunk })),
  setGeneratedTokens: (generatedTokens) => set({ generatedTokens }),
  setTargetTokens: (targetTokens) => set({ targetTokens }),
  recordRun: (run) => set((s) => ({ runs: [run, ...s.runs].slice(0, 50) })),
  reset: () =>
    set((s) => ({
      ...initialState,
      // Keep prompt and parameters across resets; clear run data only.
      prompt: s.prompt,
      temperature: s.temperature,
      topP: s.topP,
      seed: s.seed,
      warmupRuns: s.warmupRuns,
      timedRuns: s.timedRuns,
      target: s.target,
      runs: s.runs,
    })),
  clearRuns: () => set({ runs: [] }),
}));

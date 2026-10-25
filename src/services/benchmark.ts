import { invoke } from "@tauri-apps/api/core";
import type {
  BenchmarkFile,
  BenchmarkPrompt,
  BenchmarkPromptInput,
  BenchmarkRunRequest,
  BenchmarkRunSummary,
  BenchmarkSuite,
  BenchmarkSuiteInput,
} from "../types";

/** All saved prompts, by name, each with its keywords and files. */
export async function listBenchmarkPrompts(): Promise<BenchmarkPrompt[]> {
  return invoke("list_benchmark_prompts");
}

/** Create or replace a prompt. Rejects with the reason when the input is not valid. */
export async function saveBenchmarkPrompt(prompt: BenchmarkPromptInput): Promise<BenchmarkPrompt> {
  return invoke("save_benchmark_prompt", { prompt });
}

/** Delete a prompt. Rejects, naming the suites, when a suite still uses it. */
export async function deleteBenchmarkPrompt(id: string): Promise<void> {
  return invoke("delete_benchmark_prompt", { id });
}

/** Copy a picked file into the benchmark library under `id`. */
export async function importBenchmarkFile(path: string, id: string): Promise<BenchmarkFile> {
  return invoke("import_benchmark_file", { path, id });
}

/** Remove a library file that nothing uses. A file still in use is left alone. */
export async function discardBenchmarkFile(id: string): Promise<void> {
  return invoke("discard_benchmark_file", { id });
}

/** All suites, by name, each with its steps in order. */
export async function listBenchmarkSuites(): Promise<BenchmarkSuite[]> {
  return invoke("list_benchmark_suites");
}

/** Create or replace a suite and its steps. Rejects with the reason when the input is not valid. */
export async function saveBenchmarkSuite(suite: BenchmarkSuiteInput): Promise<BenchmarkSuite> {
  return invoke("save_benchmark_suite", { suite });
}

/** Delete a suite. Its runs keep their record. */
export async function deleteBenchmarkSuite(id: string): Promise<void> {
  return invoke("delete_benchmark_suite", { id });
}

/** Start a run of a suite against the loaded model. Resolves when the run has started. */
export async function startBenchmarkRun(request: BenchmarkRunRequest): Promise<void> {
  return invoke("start_benchmark_run", { request });
}

/** Every benchmark run, newest first, with its figures. */
export async function listBenchmarkRuns(): Promise<BenchmarkRunSummary[]> {
  return invoke("list_benchmark_runs");
}

/** Ask where to save and write `content` there. Resolves to the saved path, or null when cancelled. */
export async function saveBenchmarkExport(
  content: string,
  defaultName: string,
): Promise<string | null> {
  return invoke("save_benchmark_export", { content, defaultName });
}

/** Ask where to save a PNG and write it there. `dataBase64` is the image's bytes, base64 encoded. */
export async function saveBenchmarkImage(
  dataBase64: string,
  defaultName: string,
): Promise<string | null> {
  return invoke("save_benchmark_image", { dataBase64, defaultName });
}

/** Open an exported CSV or PNG in its default app. */
export async function openBenchmarkExport(path: string): Promise<void> {
  return invoke("open_benchmark_export", { path });
}

/** Stop a run in progress after the request it is waiting on. The finished steps are kept. */
export async function cancelBenchmarkRun(runId: string): Promise<void> {
  return invoke("cancel_benchmark_run", { runId });
}

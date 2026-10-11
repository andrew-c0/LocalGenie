export interface ModelInfo {
  name: string;
  size: string;
  source: "hf" | "aihub" | "docker" | "localfs";
  precisions: string[];
}

export interface SearchModel {
  id: string;
  name: string;
  downloads?: number;
  likes?: number;
  tags?: string[];
  pipeline_tag?: string;
}

/** One Qualcomm AI Hub model that GenieX can run on this chipset. */
export interface AihubModel {
  /** Fully-qualified HF-style id, e.g. `qualcomm/Qwen3-4B-Instruct-2507`. */
  name: string;
  /** `llm` | `vlm` */
  model_type: string;
}

/** A single downloadable release asset with its direct download URL. */
export type { ReleaseAsset } from "../services/hubApi";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  modelId?: string;
  stats?: GenerationStats;
}

export interface GenerationStats {
  /** ms from send to first token */
  timeToFirstToken: number;
  /** ms from send to completion */
  totalTime: number;
  /** number of token events received */
  tokenCount: number;
  /** characters in the user prompt that triggered this response */
  promptChars: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  modelId?: string;
  contextChars: number;
  createdAt: number;
  updatedAt: number;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  models: string[];
}

export interface GenerationSettings {
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  repetitionPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  maxTokens?: number;
  nctx?: number;
  systemPrompt?: string;
  think?: boolean;
}

export interface DownloadProgress {
  model: string;
  message: string;
  status: "downloading" | "complete" | "error";
}

export interface ConfigEntry {
  key: string;
  value: string;
}

export interface ServerStartOptions {
  port?: number;
  compute?: string;
  nctx?: number;
  ngl?: number;
  origins?: string;
  keepalive?: number;
}

export interface PullModelOptions {
  model: string;
  precision?: string;
  modelHub?: string;
  modelType?: string;
  localPath?: string;
}

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_url: string;
}

/** Top-level pages of the Stitch-designed workspace shell. */
export type AppView = "overview" | "models" | "chat" | "prompt-benchmark" | "settings";

export type ComputeTarget = "npu" | "gpu" | "cpu";

export type BenchmarkStatus = "idle" | "running" | "completed" | "error";

/** One throughput sample for the live benchmark chart. */
export interface BenchmarkSample {
  /** ms offset from run start */
  t: number;
  npu?: number;
  gpu?: number;
  cpu?: number;
}

export interface BenchmarkKpis {
  ttftMs: number | null;
  tokensPerSec: number | null;
  memoryBandwidthGbps: number | null;
  tempC: number | null;
}

export interface BenchmarkRankingEntry {
  model: string;
  quantization?: string;
  tokensPerSec: number;
}

export interface BenchmarkRunSummary {
  id: string;
  startedAt: number;
  target: ComputeTarget;
  ttftMs: number | null;
  tokensPerSec: number | null;
  totalTokens: number;
  promptChars: number;
}

/** Model installation state used by the model library UI. */
export type ModelInstallState = "loaded" | "ready" | "downloading" | "not-installed" | "error";

/** Extra metadata for a downloaded model, persisted in the local DB. */
export interface DownloadedModelMeta {
  precision?: string;
  contextSize?: number;
  paramCount?: number;
}

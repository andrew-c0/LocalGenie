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

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  modelId?: string;
  stats?: GenerationStats;
  /** Server `finish_reason` for an assistant reply ("stop", "length", ...), or "cancelled". Persisted. */
  finishReason?: string;
  /** True for an error shown in the chat. Stored in `chat_errors`, not in `messages`. */
  isError?: boolean;
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

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_url: string;
}

/** Top-level pages of the Stitch-designed workspace shell. */

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

/** Extra metadata for a downloaded model, persisted in the local DB. */
export interface DownloadedModelMeta {
  precision?: string;
  contextSize?: number;
  paramCount?: number;
  repoUrl?: string;
  modelCard?: string;
}

/** The chat stream in flight, and the session its tokens belong to. */
export interface ActiveStream {
  streamId: string;
  sessionId: string;
}

/** One line of `geniex serve` output, as sent by the backend. */
export interface ServerLogLine {
  seq: number;
  stream: "stdout" | "stderr";
  message: string;
}

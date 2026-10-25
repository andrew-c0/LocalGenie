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
  /** Files sent with a user message. Names only; the contents are not kept after the send. */
  attachments?: AttachmentRef[];
  /** Exact token counts the server reported for this reply. Missing when it was stopped or is older. */
  usage?: ReplyUsage;
}

/** Token counts the server reports for one reply. The prompt count covers the whole request. */
export interface ReplyUsage {
  promptTokens: number;
  completionTokens: number;
}

/** What the attach menu picks: an image, an audio clip, or a text file. */
export type AttachmentKind = "image" | "audio" | "text";

/** An attachment as stored with its message. */
export interface AttachmentRef {
  id: string;
  kind: AttachmentKind;
  name: string;
  size: number;
  /** Where the file was read from. Missing on refs saved before paths were kept. */
  path?: string;
  /** Text files: characters sent with the message, file delimiters included. Counted in the context ring. */
  chars?: number;
}

/** A file read by the Rust `read_attachment` command. Media carry `data` (base64); text carries `text`. */
export interface AttachmentFile {
  kind: AttachmentKind;
  name: string;
  size: number;
  path: string;
  mime: string | null;
  data: string | null;
  text: string | null;
}

/** One part of a chat message whose content is an array. */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: "wav" | "mp3" } };

/** Content of a chat message sent to the server: plain text, or parts when media is attached. */
export type ChatMessageContent = string | ChatContentPart[];

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
  /** Pinned conversations are listed first. Stored with the session. */
  pinned: boolean;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  models: string[];
}

/** Per-request sampling settings, sent with each chat completion. */
export interface GenerationSettings {
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  repetitionPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  maxTokens?: number;
  seed?: number;
  /** Thinking mode, sent as `enable_think`. Thinking stays inline in the reply text. */
  think?: boolean;
  /** GBNF grammar for constrained output. Empty means unconstrained. */
  grammarString?: string;
  /** Legacy single-text system prompt. Read as one text block, never written back. */
  systemPrompt?: string;
  /** Ordered system prompt blocks. Resolved into `systemPrompt` on every send. */
  systemBlocks?: SystemPromptBlock[];
}

/** One part of a system prompt. Date, platform and file blocks are resolved at send time. */
export type SystemPromptBlock =
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "datetime" }
  | { id: string; kind: "platform" }
  | { id: string; kind: "file"; path: string; name: string; size?: number };

/** Host details from the Rust `get_platform_info` command. */
export interface PlatformInfo {
  os: string;
  osVersion: string;
  arch: string;
  totalMemoryBytes: number;
}

/**
 * Model load parameters. Sent with the warmup and with every chat request; the server reloads the
 * model when they change, so a model is always used with the parameters it was loaded with.
 */
export interface ModelLoadParams {
  nctx?: number;
  ngl?: number;
  /** NPU, GPU, CPU, or an explicit device list. */
  compute?: string;
  /** HTP power mode, for example "burst". Empty means the server default. */
  powerMode?: string;
  /** Speculative decoding type (llama.cpp only). Empty means off. */
  specType?: string;
  specDraftModel?: string;
  specNMax?: number;
  specNMin?: number;
  specPMin?: number;
}

/** Everything saved for one model in `model_settings`. */
export type ModelLoadSettings = ModelLoadParams;

export type StoredModelSettings = GenerationSettings & ModelLoadSettings;

/** Capability summary from `get_model_capabilities`. Null fields are ones the model file does not say. */
export interface ModelCapabilities {
  engine: "llama_cpp" | "qairt";
  contextLength: number | null;
  architecture: string | null;
  quantisation: string | null;
  hasVisionProjector: boolean;
  /** From the projector file. Unverified until checked against a real projector. */
  hasAudioEncoder: boolean | null;
  /** Heuristic from the chat template: "likely", never a fact. */
  thinkingHint: boolean | null;
  /** Heuristic from the chat template: "likely", never a fact. */
  toolCallHint: boolean | null;
}

/**
 * Settings the settings scan tests. The sampling keys match the saved setting keys. `thinking` is
 * the Think Mode switch, and `toolCalls` is a model fact the app does not send tools for yet.
 */
export type CapabilityKey =
  | "temperature"
  | "topP"
  | "topK"
  | "minP"
  | "repetitionPenalty"
  | "presencePenalty"
  | "frequencyPenalty"
  | "maxTokens"
  | "seed"
  | "thinking"
  | "toolCalls"
  | "vision"
  | "audio"
  | "grammarString";

/**
 * Scan result for one setting. `works`: the effect was seen. `accepted`: the server returned 200,
 * but the effect was not checked. `rejected`: the server refused the value.
 */
export type CapabilityStatus = "works" | "accepted" | "rejected";

/** A stored scan result. `stale` is true when the model file or the GenieX version changed since. */
export interface CapabilityEntry {
  key: CapabilityKey;
  status: CapabilityStatus;
  /** Server text for a rejection, or what was observed. */
  detail: string | null;
  probedAt: number;
  stale: boolean;
}

/** What `scan_model_capabilities` returns: the model's results after the scan. */
export interface CapabilityScanResult {
  cancelled: boolean;
  entries: CapabilityEntry[];
}

/** Payload of `capability-scan-progress`, sent before each setting is probed. */
export interface CapabilityScanProgress {
  model: string;
  key: CapabilityKey;
  /** Zero-based position of `key` in the scan. */
  index: number;
  total: number;
}

/** Runtime versions reported by `geniex version`. Null when the CLI does not report one. */
export interface RuntimeVersions {
  llamaCpp: string | null;
  qairt: string | null;
}

/** App-wide server settings (Application & Runtime). Applied when the server starts. */
export interface ServerSettings {
  origins: string;
  keepalive: number;
}

/** Settings for one chat request: sampling plus the load parameters the server keys its cache on. */
export type ChatSettings = GenerationSettings & ModelLoadParams;

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

// Benchmark suite (test runs). Mirrors the `benchmark_*` tables; see plans/benchmarks.md.
export type BenchmarkMatchRule = "all" | "any";
export type BenchmarkFileKind = "text" | "image" | "audio";
export type BenchmarkSuiteMode = "conversation" | "independent";
export type BenchmarkRunStatus = "running" | "completed" | "failed" | "cancelled";
export type BenchmarkStepStatus = "completed" | "failed" | "skipped";

export interface BenchmarkPrompt {
  id: string;
  name: string;
  description: string | null;
  /** The text sent to the model. */
  text: string;
  matchRule: BenchmarkMatchRule;
  keywords: string[];
  files: BenchmarkFile[];
  /** Runs since the prompt was last saved. */
  runCount: number;
  createdAt: number;
  updatedAt: number;
}

/** What the prompt editor saves. The id is generated by the frontend. */
export interface BenchmarkPromptInput {
  id: string;
  name: string;
  description: string | null;
  text: string;
  matchRule: BenchmarkMatchRule;
  keywords: string[];
  fileIds: string[];
}

export interface BenchmarkFile {
  id: string;
  name: string;
  kind: BenchmarkFileKind;
  size: number | null;
  chars: number | null;
  storedPath: string;
  sha256: string;
  createdAt: number;
}

export interface BenchmarkSuiteStep {
  id: string;
  promptId: string;
  promptName: string;
  /** The prompt's own files, sent with the step. */
  promptFiles: BenchmarkFile[];
  /** Extra files for this step, on top of the prompt's own files. */
  files: BenchmarkFile[];
}

/** One step as the suite editor saves it. */
export interface BenchmarkSuiteStepInput {
  id: string;
  promptId: string;
  fileIds: string[];
}

/** What the suite editor saves. Saving replaces the suite's steps. */
export interface BenchmarkSuiteInput {
  id: string;
  name: string;
  description: string | null;
  mode: BenchmarkSuiteMode;
  warmupRuns: number;
  repetitions: number;
  steps: BenchmarkSuiteStepInput[];
}

export interface BenchmarkSuite {
  id: string;
  name: string;
  description: string | null;
  mode: BenchmarkSuiteMode;
  warmupRuns: number;
  repetitions: number;
  steps: BenchmarkSuiteStep[];
  /** Runs since the suite was last saved. */
  runCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface BenchmarkRunSettings {
  compute: ComputeTarget;
  precision: string | null;
  nctx: number | null;
  ngl: number | null;
  powerMode: string | null;
  temperature: number | null;
  topP: number | null;
  seed: number | null;
  maxTokens: number | null;
}

export interface BenchmarkRun {
  id: string;
  suiteId: string | null;
  suiteName: string;
  modelName: string;
  modelKey: string;
  settings: BenchmarkRunSettings;
  mode: BenchmarkSuiteMode;
  warmupRuns: number;
  repetitions: number;
  geniexVersion: string | null;
  chipset: string | null;
  totalMemoryBytes: number | null;
  status: BenchmarkRunStatus;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

export interface BenchmarkRunStep {
  id: string;
  runId: string;
  position: number;
  repetitionIndex: number;
  isWarmup: boolean;
  promptName: string;
  promptText: string;
  outputText: string | null;
  ttftMs: number | null;
  totalMs: number | null;
  tokensPerSec: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  peakModelMemoryBytes: number | null;
  avgModelMemoryBytes: number | null;
  peakMemoryUsedBytes: number | null;
  avgCpu: number | null;
  avgGpu: number | null;
  avgNpu: number | null;
  /** `null` when the prompt has no expected keywords. */
  passed: boolean | null;
  matchedKeywords: number | null;
  expectedKeywords: number | null;
  status: BenchmarkStepStatus;
  error: string | null;
}

/** What the Run panel starts. The run id is generated by the frontend. */
export interface BenchmarkRunRequest {
  runId: string;
  suiteId: string;
  modelName: string;
  compute: ComputeTarget;
  port: number;
  temperature: number;
  topP: number;
  maxTokens: number;
  /** The model's load settings with the compute target, sent with every request. */
  load?: ModelLoadParams;
}

/** One step's progress. `state` is `started`, `completed`, `failed` or `skipped`. */
export interface BenchmarkProgressEvent {
  runId: string;
  pass: number;
  totalPasses: number;
  stepIndex: number;
  totalSteps: number;
  promptName: string;
  isWarmup: boolean;
  state: "started" | "completed" | "failed" | "skipped";
  ttftMs: number | null;
  totalMs: number | null;
  tokensPerSec: number | null;
  passed: boolean | null;
  error: string | null;
}

export interface BenchmarkFinishedEvent {
  runId: string;
  status: BenchmarkRunStatus;
  error: string | null;
}

/** Figures for one run, from its steps. Means and peaks use the timed passes that completed. */
export interface BenchmarkRunMetrics {
  stepsCompleted: number;
  stepsFailed: number;
  stepsSkipped: number;
  meanTtftMs: number | null;
  meanTokensPerSec: number | null;
  meanTotalMs: number | null;
  keywordPassed: number;
  keywordChecked: number;
  peakModelMemoryBytes: number | null;
  meanCpu: number | null;
  meanGpu: number | null;
  meanNpu: number | null;
}

/** A benchmark run as the runs table lists it. */
export interface BenchmarkRunSummary {
  id: string;
  suiteId: string | null;
  suiteName: string;
  modelName: string;
  modelKey: string;
  compute: ComputeTarget;
  mode: BenchmarkSuiteMode;
  warmupRuns: number;
  repetitions: number;
  status: BenchmarkRunStatus;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
  metrics: BenchmarkRunMetrics;
}

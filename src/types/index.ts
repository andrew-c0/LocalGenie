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
  /** `system` for a line the app adds, such as a model change. Those are never sent to the model. */
  kind?: "text" | "system";
  /** The type of a system line, such as `model_changed`. Sets how the line is drawn. */
  systemType?: string;
  /** The compute target (`npu`, `gpu` or `cpu`) an assistant reply was generated on. */
  compute?: string;
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
  /** Settings this chat sets for itself. Keys left out use the model's settings. */
  settingsOverrides?: ChatSettingsOverrides;
}

/**
 * The settings a chat can override, as stored with the conversation. Only the keys a chat sets are
 * present; a missing key uses the model's saved value. Must match `validate_chat_overrides` in Rust.
 */
export interface ChatSettingsOverrides {
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  repetitionPenalty?: number;
  maxTokens?: number;
  seed?: number;
  /** Replaces the model's system prompt for this chat when present, even when empty. */
  systemBlocks?: SystemPromptBlock[];
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

// Playground runtimes (optional local engines installed from Settings > Runtimes). Camel case, as
// the Rust side serialises them. `services/runtimes.ts` wraps the commands.

/** One runtime the app knows about. `installedVersion` and `installPath` are null when not installed. */
export interface RuntimeInfo {
  id: string;
  displayName: string;
  repo: string;
  installedVersion: string | null;
  installPath: string | null;
}

/** Installed and latest release of one runtime, from its GitHub `releases/latest`. */
export interface RuntimeUpdateInfo {
  id: string;
  installedVersion: string | null;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
}

export type RuntimeInstallStage =
  | "checking"
  | "downloading"
  | "verifying"
  | "extracting"
  | "done"
  | "error";

/** One `runtime-install-progress` event. `total` is 0 when the size is not known. */
export interface RuntimeInstallProgress {
  id: string;
  stage: RuntimeInstallStage;
  received: number;
  total: number;
  message: string;
}

/** One file of an image model, as listed by `playground_image_models`. */
export interface ImageModelFile {
  fileName: string;
  sizeBytes: number;
  present: boolean;
}

/** A width and height in pixels. */
export interface ImageSize {
  width: number;
  height: number;
}

/** Starting values of the text-to-image form for one model. */
export interface ImageModelDefaults extends ImageSize {
  steps: number;
  cfgScale: number;
}

/** An image model the Playground can download and run. */
export interface ImageModel {
  id: string;
  name: string;
  description: string;
  license: string;
  licenseUrl: string;
  /** Size of all the model's files, in bytes. */
  totalBytes: number;
  downloaded: boolean;
  files: ImageModelFile[];
  defaults: ImageModelDefaults;
  /** False when the model ignores a negative prompt. The field is then disabled. */
  supportsNegativePrompt: boolean;
  /** False when the model fixes its CFG scale at `defaults.cfgScale`. The field is then disabled. */
  cfgAdjustable: boolean;
}

/** Request for `playground_generate_image`. A `seed` of -1 asks for a random seed. `device` is left out for auto. */
export interface ImageGenerateRequest {
  jobId: string;
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed: number;
  device?: string;
}

export type PlaygroundDeviceKind = "cpu" | "gpu" | "npu" | "other";

/** One compute device the installed stable-diffusion.cpp build reports, from `playground_list_devices`. */
export interface PlaygroundDevice {
  /** The id sent as `device` in a generate request. */
  name: string;
  description: string;
  kind: PlaygroundDeviceKind;
}

/** Result of `playground_delete_model` and `playground_delete_speech_model`: the bytes removed from disk. */
export interface PlaygroundDeleteResult {
  freedBytes: number;
}

/** `playground-download-progress`. `total` is 0 when the size of the current file is not known. */
export interface PlaygroundDownloadProgress {
  modelId: string;
  fileName: string;
  /** Position of the file being fetched, counted from 0. */
  fileIndex: number;
  fileCount: number;
  received: number;
  total: number;
}

/** `playground-download-done`. `error` is set when `status` is `error`. */
export interface PlaygroundDownloadDone {
  modelId: string;
  status: "done" | "error" | "cancelled";
  error?: string | null;
}

/** Stages of one generation, in the order they run. `sampling` is the only stage with a known length. */
export type ImagePhase = "loading" | "encoding" | "sampling" | "decoding" | "saving";

/** `playground-image-progress`. `step` counts finished steps out of `steps`, during `sampling`. */
export interface PlaygroundImageProgress {
  jobId: string;
  phase: ImagePhase;
  step: number;
  steps: number;
  /** Measured time per sampling step, or null until one step has finished. */
  secondsPerStep: number | null;
  message: string;
}

/** `playground-image-done`. `path` is set when the image was saved; `error` when it failed. `seed` is the seed used, also for a random one. */
export interface PlaygroundImageDone {
  jobId: string;
  status: "done" | "error" | "cancelled";
  path?: string | null;
  error?: string | null;
  seed: number;
  seconds: number | null;
}

/** The text-to-image form. Kept in the Playground store between visits. Width and height are always valid sizes. */
export interface ImageForm {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  /** When true the seed is sent as -1 and the field is ignored. */
  randomSeed: boolean;
  seed: number;
  /** "auto" for the runtime default, else a `PlaygroundDevice` name. */
  device: string;
}

/** A model download the app started, from the first request until it is done. Image and speech models share it. */
export interface PlaygroundDownloadState {
  status: "downloading" | "cancelled" | "error";
  /** Latest progress event. Null until the first one arrives. */
  progress: PlaygroundDownloadProgress | null;
  error: string | null;
}

/** A generation running now. Starts in the `loading` phase; `step` is 0 until the first sampling step. */
export interface ImageJob {
  jobId: string;
  modelId: string;
  /** The form's compute choice when the job started: "auto" or a device name. */
  device: string;
  startedAt: number;
  phase: ImagePhase;
  step: number;
  steps: number;
  secondsPerStep: number | null;
}

/** The last generation that ended, kept until the next one starts. `seed` is null when the job never started. `device` is the job's compute choice. */
export interface ImageResult {
  jobId: string;
  status: "done" | "error" | "cancelled";
  path: string | null;
  error: string | null;
  seed: number | null;
  seconds: number | null;
  device: string;
}

/** Speech models: `stt` turns a recording into text, `tts` reads text aloud. */
export type SpeechKind = "stt" | "tts";

/** One voice of a text to speech model. `id` is the speaker id the runtime takes; `label` reads as "Heart (US female)". */
export interface SpeechVoice {
  id: number;
  name: string;
  label: string;
}

/** A speech model the Playground can download and run. `voices` is empty for speech to text. */
export interface SpeechModel {
  id: string;
  kind: SpeechKind;
  name: string;
  description: string;
  license: string;
  licenseUrl: string;
  /** Size of all the model's files, in bytes. */
  sizeBytes: number;
  languages: string[];
  downloaded: boolean;
  voices: SpeechVoice[];
}

/** Request for `playground_transcribe`. `jobId` is generated by the frontend. */
export interface SpeechTranscribeRequest {
  jobId: string;
  modelId: string;
  audioPath: string;
}

/** Request for `playground_synthesize`. `speed` runs from 0.5 to 2.0. */
export interface SpeechSynthesizeRequest {
  jobId: string;
  modelId: string;
  text: string;
  voiceId: number;
  speed: number;
}

/** Stages of one speech job. The backend reports them through `playground-speech-progress`. */
export type SpeechPhase = "loading" | "running" | "saving";

/** `playground-speech-progress`. */
export interface PlaygroundSpeechProgress {
  jobId: string;
  phase: SpeechPhase;
}

export type SpeechStatus = "ok" | "cancelled" | "error";

/** `playground-speech-done`. `text` is set for speech to text, `outputPath` for text to speech; `error` when `status` is `error`. */
export interface PlaygroundSpeechDone {
  jobId: string;
  kind: SpeechKind;
  status: SpeechStatus;
  text?: string | null;
  outputPath?: string | null;
  audioSeconds?: number | null;
  elapsedSeconds?: number | null;
  error?: string | null;
}

/** A speech job running now. Starts in the `loading` phase. */
export interface SpeechJob {
  jobId: string;
  kind: SpeechKind;
  modelId: string;
  startedAt: number;
  phase: SpeechPhase;
}

/** The last speech job of one kind that ended, kept until the next job of that kind starts. */
export interface SpeechResult {
  jobId: string;
  kind: SpeechKind;
  status: SpeechStatus;
  text: string | null;
  outputPath: string | null;
  /** Length of the audio: the recording for speech to text, the saved speech for text to speech. */
  audioSeconds: number | null;
  elapsedSeconds: number | null;
  error: string | null;
}

/** The recording or file the speech to text panel transcribes. `audioPath` is what the backend reads. */
export interface SpeechAudioInput {
  audioPath: string;
  /** Name shown in the panel: the file name, or the recording's time. */
  audioName: string;
}

/** The text to speech form. Kept in the speech store between visits. `voiceId` is null until the model's voices are known. */
export interface SpeechForm {
  text: string;
  voiceId: number | null;
  speed: number;
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
  /** Facet summary as JSON text (see utils/hubModelInfo). */
  facets?: string;
}

/** The chat stream in flight, and the session its tokens belong to. */
export interface ActiveStream {
  streamId: string;
  sessionId: string;
  /** The compute target of the request, recorded on the reply. */
  compute?: string;
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

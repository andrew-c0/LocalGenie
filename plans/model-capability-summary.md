# Plan: per-model capability summary from GGUF metadata

Status: planned, not started. No code for this has been written yet.

## Goal
Show, for each downloaded model, what it can do, before the user sends a message. Use that to warn about settings that will be ignored, and to disable controls that don't apply. Also replace the server's generic "a parameter in the request is not supported by the runtime" error with a message that says what to change.

## Background (verified)
- GenieX reports capabilities only after a model loads: vision and audio flags (`geniex_vlm_get_capabilities`), and vocabulary size and embedding width (`geniex_llm_get_model_info`). Neither is exposed through the CLI or the HTTP server.
- The HTTP model object (`GET /v1/models/{id}`) returns `model_type` only (`cli/server/handler/model.go`).
- Engine rules are static. QAIRT ignores context length, GPU layers, stop sequences and speculation. The settings UI already encodes these (`utils/modelSettings.ts`, `loadSettingDisabledReason`).
- LocalGenie already reads `<arch>.context_length` from GGUF headers (`src-tauri/src/gguf.rs`, `read_context_length`). The GGUF format notes are in `memories/external/gguf/`.
- Silently dropped settings (no error, no warning): `nctx` and speculation on QAIRT (`cli/server/service/keepalive.go:45-50, 82-85`), and `stop` on `/v1/chat/completions` (never read in `cli/server/handler/chat.go`).

## What the summary contains
Each field records where it came from, so the UI can say whether a value is read or inferred:

| Field | Source | Certainty |
|---|---|---|
| `engine` | Downloaded model source: `aihub` means QAIRT, otherwise llama.cpp | Certain |
| `contextLength` | `<arch>.context_length` in the GGUF header | Certain |
| `architecture` | `general.architecture` | Certain |
| `quantisation` | `general.file_type`, or the file name | Certain |
| `hasVisionProjector` | An `mmproj` sidecar in the model folder (downloaded by the sidecar step in `downloadPipeline.ts`) | Certain |
| `hasAudioEncoder` | `clip.has_audio_encoder` in the projector GGUF | Unverified. Confirm against a real projector file before relying on it |
| `thinkingHint` | `tokenizer.chat_template` contains `<think>` or the reasoning markers | Heuristic |
| `toolCallHint` | `tokenizer.chat_template` references tool calls | Heuristic |

The hint fields are shown as "likely", never as facts.

## Rust
- `src-tauri/src/gguf.rs`: generalise the header reader so one pass collects the keys in the table above. Keep the existing `read_context_length` behaviour and its tests. Read the chat template as a string value, with a size cap (for example 256 KB), since templates can be large.
- New command `get_model_capabilities(modelPath)` in `commands/models.rs` (or a new `capabilities.rs`). Returns the summary, with `null` for any field it can't read.
- Projector detection looks at the model folder, so it works without parsing the projector file.
- Cache results per path and file modification time in memory, so the settings screen doesn't re-read large headers.

## Frontend
- `services/models.ts`: `getModelCapabilities(path)` wrapper.
- `utils/modelCapabilities.ts`: pure helpers. Given a summary and the stored settings, return the warnings for each setting. For example: a QAIRT model with a non-default context window gets "Ignored: context length is fixed when the QAIRT bundle is compiled." A llama.cpp model with a context window above `contextLength` gets a warning, but only if the server does not clamp it (verify first; the GenieX docs say it raises the window up to the trained maximum).
- `ModelSettings.tsx`: show a capability block above the settings (engine, context length, quantisation, vision projector, thinking and tool hints). Show the warnings next to the affected controls.
- Thinking control: when `thinkingHint` is false, keep the switch enabled but add a caption that the model may not think.

## Error mapping
- Chat errors show the server's generic message today. Add a mapping in `utils/chatError.ts` for the known causes: image or audio sent to a text-only model, an unsupported power mode, an unsupported compute target. Fall back to the raw text when nothing matches.
- Verify each cause against the live server before writing its message.
- Each mapped error is written to the Logs area in Settings (`ServerLogsCard`) as well as shown in the chat, so the logs keep the same detail the user sees.

## Files
- New: `utils/modelCapabilities.ts` (+ test), `services/models.ts` (or add to an existing service file), a capability block component under `components/ModelSettings/`.
- Changed: `src-tauri/src/gguf.rs`, `commands/models.rs` (or new `capabilities.rs`), `lib.rs`, `utils/chatError.ts`, `ModelSettings.tsx`.

## Verification
- Rust unit tests with synthetic GGUF headers: context length, architecture, file type, chat template hints, missing keys return `null`, oversized template is capped.
- Frontend unit tests: warning rules per engine, and thinking hint captions.
- Live: check the summary for `unsloth/Qwen3.5-0.8B-GGUF` (llama.cpp, Q8_K_XL, no projector). Check one vision model with a projector, to confirm `hasVisionProjector` and the audio key.
- Live: send a QAIRT model a non-default context window and confirm the warning, and that the reply is unaffected.
- `cargo test`, `cargo clippy`, `npm run check`, `npm run lint`, `npx vitest run`.

## Decisions (resolved)
1. **Thinking and tool hints are shown** as heuristics, labelled "likely" in the UI.
2. **Context-window warning is a warning, not a hard block.** Show it next to the control for now. Revisit once models that use more memory have been tested.
3. **Live vision check is pending.** The user will download a vision model with a projector. Until then, the `hasVisionProjector` and audio-key checks stay unverified.
4. **Error messages ship with this plan.** Each mapped error is also written to the server logs shown in the Logs area under Settings (`ServerLogsCard`), next to the normal log lines. The mapping covers the known causes in the Error mapping section.

## Open items
- Confirm `clip.has_audio_encoder` (and the projector keys) once the vision model is downloaded.

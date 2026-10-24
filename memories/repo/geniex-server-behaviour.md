# GenieX server behaviour (as LocalGenie depends on it)

Source: the official GenieX repo (github.com/qualcomm/GenieX, read-only), checked against `cli/server/**` and `cli/cmd/geniex/**` at GenieX CLI v0.9.3, as of 2026-10-22. The `/status` and content-part entries were re-checked on 2026-10-23 against the GenieX checkout at `C:\Work\GenieX`. Routes and request fields are in `memories/geniex-cli-reference.md`. The live result below was reported from a run against `geniex serve` v0.9.3 with `unsloth/Qwen3.5-0.8B-GGUF` Q8_K_XL (2026-10-22); knowledge-sync did not re-run it.

## One model in memory (model cache)
- The server holds one loaded model (`cli/server/service/keepalive.go`). A load request for another model drops the current one first (`destroy()`).
- Cache key = model name + `ModelParam` (nctx, ngl, device/compute, power mode, speculative settings). A request with the same key reuses the model; any change reloads it (the old one is destroyed).
- Changing only the conversation (session key) resets the KV cache but keeps the model loaded.
- Loaded models: `GET /status` returns `models[]` (`id`, `state`) for the loaded models (`cli/server/handler/status.go`). `GET /v1/models` lists every cached model, loaded or not, so it is not a loaded-model list. LocalGenie reads `/status` (`server.rs` `fetch_loaded_models`).
- There is no per-model unload route or CLI command. The model leaves memory only when the server stops or the keepalive sweep frees it after the idle timeout (`--keepalive`, default 300 s).
- Reported live result: a warmup and then a chat with identical load params did not reload. Changing `nctx` destroyed and reloaded the model.

## Consequences for LocalGenie
- Load parameters (`nctx`, `ngl`, `compute`, `power_mode`, `spec_*`) must be sent with the warmup and with every chat request, or the first message reloads the model (`commands/chat_helpers.rs` `apply_load_params`).
- Origins and keepalive are server-start options only; changing them restarts the server.
- Stopping the server is the only unload (`unload_all_models`).

## Chat endpoint behaviour
- Defaults when a field is omitted (`cli/server/handler/chat.go`): `enable_think` true, `reasoning_format` "deepseek" (moves thinking to `reasoning_content`), `repetition_penalty` 1.0, `top_k` 0, `min_p` 0.
- LocalGenie sends `reasoning_format: "none"` so thinking stays inline in `content`; the UI splits `<think>` blocks.
- `stop` is not read by `/v1/chat/completions`. Only `/v1/completions` honours it (`cli/server/handler/completion.go`). LocalGenie offers no stop setting.
- `image_url`, `input_audio` content parts and `tools` are accepted by the chat endpoint. LocalGenie sends them only in the settings scan probes (`capability_scan.rs`), not in chat.
- A text-only model rejects `image_url` and audio parts with HTTP 400 `not support content part type` (`cli/server/handler/chat_messages.go`; reported live). The scan's vision and audio probes rely on this.
- A streamed client disconnect stops generation (reported live).
- llama.cpp keeps special tokens in the output: Gemma 4 thinking markers (`<|channel>thought` ... `<channel|>`) reach the reply content (reported live). The thinking parser in `shared/thinking-patterns.json` relies on this.
- `enable_think` and `tools` behaviour was tested live; the settings scan's `thinking` and `toolCalls` probes (`capability_scan.rs`) are the test code. Specific findings are not recorded here.

## Local GGUF import rejects `mtp` in weight filenames
- `geniex pull <repo>:<precision> --model-hub localfs` skips any `.gguf` whose lowercased name contains `mtp` (`is_weight_gguf` in `sdk/model-manager/crates/core/src/manifest_builder.rs`, GenieX checkout, read-only). A repo whose only weight files have `mtp` in the name fails with "has no model files GenieX can load". Meant for separate MTP draft files, but it also hits a model name such as `Tiel-Coder-35B-A3B-MTP-UD-IQ4_XS.gguf`.
- Verified on the maintainer's machine (reported): renaming the folder and file to drop the `mtp` token made the same import succeed and the model load. Workaround and status: `known-issues.md`.
- LocalGenie's sidecar parser (`src/utils/gguf.ts` `findSidecarMarker`) treats `mtp` as a sidecar marker only at the start or end of a name, so an `MTP` inside a model name stays part of it.

## Gaps in the GenieX source (do not rely on these)
- Volces hub: in the SDK enum (`GENIEX_HUB_VOLCES`) but not exposed by the CLI; `sdk/model-manager/crates/ffi/src/pull.rs` falls back to Hugging Face.
- `geniex update` on Windows prints "Already up-to-date." when the installer is not code-signed, even if a newer version exists (`cli/cmd/geniex/update.go`).
- Keepalive does not unload for RAM/VRAM pressure (TODO at `keepalive.go`, the model is only replaced or swept).
- REPL history is not persisted (`cli/internal/readline/history.go`, TODO).
- `/metrics` returns 501 unless `serve --metrics` is set.

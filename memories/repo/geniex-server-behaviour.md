# GenieX server behaviour (as LocalGenie depends on it)

Source: the official GenieX repo (github.com/qualcomm/GenieX, read-only), checked against `cli/server/**` and `cli/cmd/geniex/**` at GenieX CLI v0.9.3, as of 2026-10-22. The `/status` and content-part entries were re-checked on 2026-10-23 against the GenieX checkout at `C:\Work\GenieX`. Routes and request fields are in `memories/geniex-cli-reference.md`. The live result below was reported from a run against `geniex serve` v0.9.3 with `unsloth/Qwen3.5-0.8B-GGUF` Q8_K_XL (2026-10-22); knowledge-sync did not re-run it.

## One model in memory (model cache)
- The server holds one loaded model (`cli/server/service/keepalive.go`). A load request for another model drops the current one first (`destroy()`).
- Cache key = model name + `ModelParam` (nctx, ngl, device/compute, power mode, speculative settings). A request with the same key reuses the model; any change reloads it (the old one is destroyed).
- Changing only the conversation (session key) resets the KV cache but keeps the model loaded.
- Loaded models: `GET /status` returns `models[]` (`id`, `state`) for the loaded models (`cli/server/handler/status.go`). `GET /v1/models` lists every cached model, loaded or not, so it is not a loaded-model list. LocalGenie reads `/status` (`server.rs` `fetch_loaded_models`).
- There is no per-model unload route or CLI command. The model leaves memory only when the server stops or the keepalive sweep frees it after the idle timeout (`--keepalive`, default 300 s).
- Reported live result: a warmup and then a chat with identical load params did not reload. Changing `nctx` destroyed and reloaded the model.

- Several models at once: run one `geniex serve --host 127.0.0.1:<port>` per model. Tested live on 2026-10-30 (CLI v0.10.0): two servers on 18191 and 18192, Qwen3.5-2B Q4_0 on one and Gemma 4 E4B IQ4_XS on the other, both on CPU. Each answered a simultaneous chat request and `/status` on each showed only its own model. Mixed compute, same day: three servers at once, Qwen3.5-2B Q4_0 with `compute: npu`, Gemma 4 E4B IQ4_XS with `cpu`, and Qwen3.5-2B with `gpu`. All three answered a simultaneous request (2.8 s, 7.4 s and 5.8 s including model load). `/status` reports an empty `device`, so the unit actually used was not confirmed from the server, and the status check after the run came back empty. Not tried: RAM limits with large models.

## Consequences for LocalGenie
- Load parameters (`nctx`, `ngl`, `compute`, `power_mode`, `spec_*`) must be sent with the warmup and with every chat request, or the first message reloads the model (`commands/chat_helpers.rs` `apply_load_params`).
- Origins and keepalive are server-start options only; changing them restarts the server.
- Stopping the server is the only unload (`unload_all_models`).
- The benchmark runner (`commands/benchmark_runner.rs`) follows the same rule: every step request carries the model's load params and the model id from `/status`.

## Chat endpoint behaviour
- Defaults when a field is omitted (`cli/server/handler/chat.go`): `enable_think` true, `reasoning_format` "deepseek" (moves thinking to `reasoning_content`), `repetition_penalty` 1.0, `top_k` 0, `min_p` 0.
- LocalGenie sends `reasoning_format: "none"` so thinking stays inline in `content`; the UI splits `<think>` blocks.
- `stop` is not read by `/v1/chat/completions`. Only `/v1/completions` honours it (`cli/server/handler/completion.go`). LocalGenie offers no stop setting.
- `image_url`, `input_audio` content parts and `tools` are accepted by the chat endpoint (`cli/server/handler/chat_messages.go`; checked on 2026-10-25 against the local checkout at `C:\Work\GenieX`, version not recorded). LocalGenie sends `image_url` (a data URL) and `input_audio` (`data` plus `format`) parts in chat when the user attaches an image or audio clip, and in the settings scan probes (`capability_scan.rs`). The server writes each part to a temp file; an `input_audio` `data` without a `data:` prefix becomes `data:audio/<format>;base64,...`. An mp3 `format` is accepted by this code path but is not verified in a live run.
- Usage: with `stream_options.include_usage` set, the chat stream sends a usage chunk (`prompt_tokens`, `completion_tokens`) after the finish chunk and before `[DONE]` (`cli/server/handler/chat_stream.go`; code-read on 2026-10-25, not verified in a live run). LocalGenie sends the flag and uses the counts for its context total. LocalGenie's comments read the prompt count as covering the whole request, media included; this is not verified.
- A text-only model rejects `image_url` and audio parts with HTTP 400 `not support content part type` (`cli/server/handler/chat_messages.go`; reported live). The scan's vision and audio probes rely on this.
- A streamed client disconnect stops generation (reported live).
- llama.cpp keeps special tokens in the output: Gemma 4 thinking markers (`<|channel>thought` ... `<channel|>`) reach the reply content (reported live). The thinking parser in `shared/thinking-patterns.json` relies on this.
- `enable_think` and `tools` behaviour was tested live; the settings scan's `thinking` and `toolCalls` probes (`capability_scan/`) are the test code. Specific findings are not recorded here.

## Runtimes in the AI Hub catalog (what the tab lists)
- `src-tauri/proto/shared/runtime.proto` values: 2 `QNN_DLC`, 3 `QNN_CONTEXT_BINARY`, 6 `GENIE`, 11 `GENIEX_QAIRT`, 12 `GENIEX_LLAMACPP`.
- The tab lists a model only with runtime 11 or 12 and a runnable asset (`commands/aihub.rs`). Runtime 11 is a QAIRT zip imported with `geniex pull ... --local-path <zip>`. Runtime 12 is a Hugging Face GGUF imported like any other GGUF.
- Reported on 2026-10-28 (maintainer, live; not re-run here): GenieX runs llama.cpp GGUF and QAIRT Genie bundles (`genie_config.json` plus `ctx-bins`; the QAIRT plugin reads these, `sdk/plugins/qairt/src/llm.cpp` in the checkout). Runtime 6 Genie bundles had no `metadata.json` and failed to load. Runtimes 2 (QNN DLC) and 3 (QNN context binary) failed on import or load. These are not listed in the tab.

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

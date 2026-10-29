# Playground runtimes: implementation plan

Status: plan only, nothing built. Written 2026-10-28. Builds on `playground-runtimes.md` (research, decisions in section 10). Target: Snapdragon X, Windows ARM64. Runtimes are optional, installed from Settings. GenieX stays the text engine.

## 1. What the app has today (code-read, not run)

| Area | Existing piece | Reuse for runtimes |
|---|---|---|
| CLI install and update | `commands/cli_update.rs`: GitHub `releases/latest`, finds the `cli-setup` + `windows-arm64` `.exe` asset, downloads to app data, launches the installer, polls the version. `CliMissingBanner`, `CliUpdateCard`. | Same shape (latest release, asset pick, download, install, verify). Generalise `fetch_latest_release_json(repo)`. |
| Server lifecycle | `commands/server.rs`: spawns a child, tracks the PID in `AppState`, forwards output as `server-log`, `taskkill /T` to stop, `server-stopped` event. | Generalise to a registry of child processes keyed by runtime id, with their own logs. |
| Downloads | `commands/download.rs` `download_file`: `.part` + HTTP Range resume, cancel, progress events. URL allowlist is two fixed prefixes (Hugging Face, AI Hub bucket). Frontend queue in `downloadStore` + `DownloadDrawer` + `downloadPipeline.ts`. | Reuse for runtime archives and models. The allowlist must become per-purpose (add GitHub release hosts for runtime archives). |
| HF library | `hubApi.ts` (REST), `HubModelBrowser` with task, library, licence, size, quantisation facets; `utils/hubModelInfo.ts`; `memories/external/huggingFace/hub-api.md`. | Browse and file listing already work. Needs "compatible with runtime X" filtering. |
| AI Hub catalog | `commands/aihub.rs`: lists only runtime 11 and 12 models. | Runtimes 3 and 5 (QNN context binaries, precompiled QNN ONNX; the Stable Diffusion bundles) are filtered out today. Needed for the ORT-QNN phase. |
| DB | `downloaded_model` feeds the chat model selector. Migrations are append-only. | Do not put Playground models in it (they would show up in chat). New tables. |
| Settings | `AppSettings`, `settings/` cards (`RuntimeVersionsCard` shows GenieX's llama.cpp and qairt versions). | New "Runtimes" section with one card per runtime. |
| Playground | `PlaygroundPage` is a placeholder. | Panels per function, gated on runtime installed. |

## 2. Release facts checked today (GitHub API, 2026-10-28)

- **stable-diffusion.cpp** `master-1024-77b72a2` (published 2026-10-28; releases are near-daily). Windows assets: `win-cpu-x64`, `win-vulkan-x64`, `win-cuda12-x64`, `win-rocm-x64`. **No Windows ARM64, no OpenCL asset, no server binary listed.** x64 builds would run under emulation: CPU only, slow. ARM64 needs our own build.
- **sherpa-onnx** `v2.0.1` (2026-10-26): official `win-arm64` archives (`shared-MD-MinSizeRel` 18 MB with TTS, `no-tts` variants, JNI jar). Executables inside the archives, and QNN in the Windows build, **not checked**.
- **onnxruntime-qnn** `v2.7.0` (2026-10-13): `win-arm64.zip` (63 MB) and `win-arm64x.zip` (110 MB). A library, not a program.
- **whisper.cpp** `v1.9.5`: no Windows assets listed. Dropped from the plan (sherpa-onnx covers Whisper).

## 3. Shared framework (phase 0, needed by every runtime)

Build once, so each runtime is a small descriptor plus an adapter.

**Backend (`src-tauri/src/runtimes/`, one domain per module):**
- `RuntimeSpec`: id, display name, release source (GitHub repo and asset name pattern), archive kind (zip, tar.bz2, installer), executable path inside the archive, health check, post-install steps, compatible HF filters.
- Install dir: `<app data>/runtimes/<id>/<version>/`, no admin rights, side by side. A `current` pointer picks the active version, so update is atomic and rollback is one pointer change.
- Commands: `runtime_list`, `runtime_check_update(id)`, `runtime_install(id, version?)`, `runtime_uninstall(id)`, `runtime_start/stop/status(id)`. Events: `runtime-install-progress`, `runtime-log`, `runtime-stopped` (modelled on the existing server events).
- Download: reuse the `download_file` core; add a separate allowlist for runtime archives (`https://github.com/<repo>/releases/download/`). Record SHA-256 of what was downloaded; compare with the GitHub asset `digest` when present (**check that the API returns it**).
- Update check: GitHub `releases/latest`, cached (unauthenticated limit is 60 requests an hour), run when Settings > Runtimes opens and at most once a day.
- **Tested-version pinning:** the app ships a small manifest (`runtimes.json`): the version each runtime was tested with, min app version, notes. Settings shows "installed / tested / latest". Default install is the tested version; "latest" is opt-in, because sd.cpp ships daily and QNN pieces must match each other.
- Post-install: write a `runtime.json` (paths, backend choice, version), check the ARM64 VC++ runtime DLLs, remove the Mark-of-the-Web flag from extracted files, run a smoke test (binary starts and prints its version or backend list), then mark ready.
- Process model: per-runtime child process on `127.0.0.1` with a free port when it has a server mode, else run the CLI per job and stream its output. Kill tree on app exit, as the GenieX server does today.

**DB (new migration; never edit applied ones):**
- `installed_runtime` (runtime id PK, version, path, source url, sha256, backend, installed_at).
- `runtime_model` (id PK, runtime id, repo id or source, relative path, files JSON, size, task, facets JSON, downloaded_at).

**Models:**
- Stored under `<app data>/runtime-models/<runtime>/<owner--name>/`. Unlike GenieX imports, files stay in place (no copy, no cleanup step).
- Downloads use the existing queue and drawer. A new `runRuntimeModelDownload` in `downloadPipeline.ts`: all files of a "recipe", then a row in `runtime_model`.
- **Recipes, not single files.** Diffusion models need several files (FLUX: diffusion model, VAE, `clip_l`, `t5xxl`). Speech models are folders. So a model is a recipe: a list of HF files (or a GitHub release asset) plus the runtime flags. Ship a curated recipe catalogue first (JSON, updatable with the app), and add free HF search per runtime later, filtered by pipeline tag (`text-to-image`, `automatic-speech-recognition`, `text-to-speech`, ...) and by file layout rules per runtime.
- sherpa-onnx models are mostly GitHub release assets (`asr-models`, `tts-models` tags) and `csukuangfj/*` Hugging Face repos, so the download allowlist needs both. **Verify before building.**

**Frontend:**
- Settings > Runtimes: one card per runtime (status, installed / tested / latest, Install, Update, Uninstall, Open folder, backend picker, last log lines).
- Playground: a capability registry (`text-to-image`, `speech-to-text`, ...) mapping to a runtime and its model list. A panel shows an "Install in Settings" call to action when the runtime is missing. `invoke()` stays in `services/runtimes.ts`.
- Routes only in `Navigation.tsx`.

**Exit test for phase 0:** install and uninstall a dummy runtime end to end, update with rollback, kill the app and confirm no orphan process.

## 4. Runtime 1: sherpa-onnx (audio) — done on CPU (2026-10-29)

Status: built (working tree, not committed). Spike findings and results are in section 12. The steps below are the original plan.

Why first: official Windows ARM64 binaries exist, small, no build step, covers speech-to-text, text-to-speech, speech enhancement, source separation, voice activity detection.

1. **Spike (1 day):** download `win-arm64-shared-MD-MinSizeRel`, list contents (are there command-line programs, or only DLLs and a C API?), run one Whisper or Moonshine model and one Kokoro or Piper voice on CPU. Record timings. Check whether the Windows build has QNN.
2. **Adapter:** descriptor (GitHub `k2-fsa/sherpa-onnx`, asset `win-arm64-shared-MD-MinSizeRel`). Run mode: if programs exist, CLI per job (offline ASR, offline TTS to wav). If only DLLs, build a small helper binary in our repo that links the C API (that helper then ships from our releases, like phase 3).
3. **Models:** curated recipes (a Whisper size, Moonshine, one Kokoro, one Piper voice). HF and GitHub release downloads.
4. **Playground panels:** speech-to-text (file or microphone, text out), text-to-speech (text in, audio player and save), later enhancement and separation.
5. **Updates:** GitHub latest, tested-version pin.
6. **NPU:** deferred to phase 3 (ORT-QNN), unless the spike shows QNN works in the Windows build.

## 5. Runtime 2: stable-diffusion.cpp (image, edit, video)

Blocker: **no upstream Windows ARM64 binary.** Options:
- A. **Our own build.** A small repo (or workflow in this one) with CI on a Windows ARM64 runner that builds a pinned upstream commit with OpenCL (Adreno) and CPU (and Vulkan if it works), publishes a release with the same asset layout. LocalGenie's descriptor points at that repo. Updates then follow our releases, and we choose when to move to a newer upstream commit. Recommended.
- B. Upstream x64 build under emulation: only as a day-one stopgap (CPU, slow).
- C. Community fork releases (mpulukkinen): unmaintained risk, unknown provenance. Not recommended for shipping.

Steps:
1. **Spike (2 days):** build upstream for ARM64 with OpenCL and CPU on the dev machine (needs Clang; MSVC `cl` is not supported for the ggml OpenCL backend). Run SD 1.5 or 2.1 and one newer model; measure CPU vs Adreno. Check `sd-cli --help` for img2img and edit, and whether a server mode exists (not in the release assets).
2. **CI build** and release process (build number, hash, notes). Decide the asset names.
3. **Adapter:** run mode likely CLI per job (prompt, size, steps, seed, output path), progress parsed from output, cancel by killing the process. Server mode if it exists.
4. **Recipes:** SD 1.5 (single file), SDXL-Turbo, one FLUX or Z-Image GGUF set, Wan 2.1 1.3B for video. Video later (4k+1 frames, size multiple of 16, slow).
5. **Playground panels:** text-to-image (prompt, size, steps, seed, gallery), image-to-image / edit (input image + prompt), later upscale and video.
6. **Phase 2b (optional, experimental): Hexagon NPU.** The community repo needs a patched sd.cpp and llama.cpp tied to specific GenieX versions. Treat as a separate artefact in our CI, behind an "experimental NPU" toggle, only after phase 4 results.

## 6. Runtime 3: ONNX Runtime + QNN (NPU add-ons)

A library, so we ship our own sidecar: **`localgenie-ort-worker`** (Rust or C++), built in CI, loads `onnxruntime-qnn` (win-arm64 zip, `v2.7.0`) and runs pipelines. Do this after 1 and 2 prove the framework.

1. **Spike (3 days):** from a small program, register the QNN plugin library, run one AI Hub model (Real-ESRGAN, a few seconds to prove it) and Whisper encoder. Open question from research: does the Rust `ort` crate register a plugin EP, or do we use the C API?
2. **Version matrix:** AI Hub bundle version, QAIRT version, ORT version, QNN EP version must match. Put the matrix in `runtimes.json`.
3. **Models:** AI Hub catalogue widened to the runtimes the worker supports (3, 5), shown in the Playground model picker, not the Models tab. Per-model pipeline code (tokenizer, scheduler, quantisation): Real-ESRGAN first (simplest), Whisper (AI Hub) second, SD 2.1 last.
4. **Panels:** reuse the image-to-image and speech-to-text panels; the runtime choice becomes a backend choice (CPU / GPU / NPU) in the panel.

## 7. Order and gates

| Phase | Work | Gate to continue |
|---|---|---|
| 0 | Runtime framework, Settings > Runtimes, DB, download allowlist, process registry | Dummy runtime install, update, rollback, uninstall |
| 1 | sherpa-onnx | One STT and one TTS result in Playground on CPU |
| 2 | stable-diffusion.cpp (+ own ARM64 CI build) | One text-to-image result on CPU and on Adreno OpenCL |
| 3 | ORT-QNN worker | One AI Hub model on the NPU, matches reference output |
| 4 | Optional: Hexagon NPU for sd.cpp, video, enhancement, separation | Case by case |

Each phase ends with entries in `known-issues.md`, `manual-checklist.md`, the codebase map (via the `knowledge-sync` agent), and a `tasks.md` update. IPC changes are done through `repo-default` (Rust half to `rust-expert`, UI half to `react-expert`).

## 8. Risks

- ARM64 builds depend on our CI (sd.cpp, worker). A runner that builds Windows ARM64 is needed. **Unconfirmed that GitHub-hosted ARM64 Windows runners are available for this repo.**
- Daily upstream churn (sd.cpp): tested-version pinning mitigates.
- Hexagon libraries must be signed; the NPU path may need versions tied to GenieX.
- Disk: runtimes are small (18 MB to 60 MB), models are not (SD 2 GB to 9 GB, Wan more). The drawer needs disk-space checks before downloads.
- Licence review per runtime and per model (SD 2.1 is CreativeML OpenRAIL-M; sherpa voices have their own licences). Show licence on the model card before download.
- Security: download only from allowlisted hosts over https, verify hashes, never run archives from other sources, extract with path-traversal checks (zip-slip).

## 9. Decisions (user, 2026-10-28)

1. Own ARM64 builds are published as GitHub releases from a separate runtimes repo (name and visibility to confirm).
2. Version policy: test with the latest release. Settings offers an upgrade when a newer version appears. No tested-version pin by default (section 3's manifest becomes optional notes only).
3. Playground starts with a curated list: about 3 best testable models at the top of each Playground subpage. Hugging Face models come later.
4. Order: **stable-diffusion.cpp first**, because it is the first runtime meant to cover CPU, GPU and NPU. The shared framework (phase 0) is built as part of it, then sherpa-onnx, then ORT-QNN.

## 10. Spike log

- Machine: Snapdragon X, Adreno X1-85, 31.5 GB RAM, 343 GB free. VS 2026 Community 18.5 has CMake and Ninja; no `clang`/`clang-cl`, no LLVM install. OpenCL needs Clang plus the Khronos OpenCL headers and ICD loader (not checked).

## 11. Status after the build spikes (2026-10-29)

- **CPU:** the fork's Clang ARM64 build (`andrew-c0/stable-diffusion.cpp`, tag `arm64-<sha>`) is about 9x faster than the MSVC build on SD-Turbo 512x512 x 4 steps (about 24 s against 228 s). Release workflow: `.github/workflows/windows-arm64-release.yml` in the fork, runs on push to master or by hand. Needs a fixed `-march=armv8.7a+fp16+dotprod+i8mm` (a native build on the runner crashed with an illegal instruction on Snapdragon X) and the default `/EHsc` flags kept.
- **GPU (Adreno, OpenCL):** works locally (`GPUOpenCL`), slower than the CPU on SD-Turbo (about 43-51 s). In progress: ship it as a dynamically loaded backend (ggml-opencl.dll) so machines without OpenCL.dll still run on CPU. The app defaults to the CPU.
- **`--list-devices` printed nothing:** stdout is not flushed after the OpenCL probe; the fork workflow patches `fflush(stdout)`.
- **NPU through GenieX's ggml-hexagon.dll: closed for now.** With a shim exporting `ggml_backend_init`/`ggml_backend_score`, HTP0 registers and the session opens (needs `ADSP_LIBRARY_PATH` pointing at the folder with the skel and catalog), then it access-violates inside GenieX's DLL, even with ggml built from the exact llama.cpp commit (19cce69) and a 64-byte tensor name field. Building the Hexagon host ourselves needs the Hexagon SDK (PKLA). Not pursued.
- **NPU later (nice to have):** wait for GenieX/Genie text-to-image (QAIRT 2.49 notes an SD 3.0 path), or Qualcomm's QAI AppBuilder (`qualcomm/qai-appbuilder`, v2.51.40, `win_arm64` wheels, SD 1.5 / 2.1 / 3.5 Medium samples), or ONNX Runtime + QNN. `Kreuzhofen/hk-npu-studio` shows the QAI AppBuilder route works but its licence is evaluation-only, so no code reuse.
- **Known issue (GPU, OpenCL):** a CFG scale above 1 gives a blank white image because sd.cpp's batched CFG forward breaks on the Adreno backend (CFG 1.0 works). Workaround: `--batched-cfg off`, which the app passes for every non-CPU device (`playground/args.rs`). Cause inside ggml-opencl not confirmed. Re-test after each ggml update (fork sync) and drop the flag if fixed. Also: GPU is slower than the CPU in every measurement so far (SD-Turbo 512x512 x4: CPU 25 s, GPU 43 s; SD 1.5 Q4: CPU 57 s at 6 steps, GPU 102 s at 4 steps).

## 12. sherpa-onnx spike and result (2026-10-29)

- **CLI programs are shipped:** the `win-arm64-shared-MT-MinSizeRel` archive (v2.0.1) has command-line programs in `bin/` (`sherpa-onnx-offline`, `sherpa-onnx-offline-tts`), so no helper binary is needed. The app runs one program per job and reads its output.
- **Speed on CPU (real-time factor, lower is faster):** Whisper tiny.en 0.044, Moonshine base 0.02, Kokoro 0.84.
- **Models built in:** `whisper-tiny-en`, `moonshine-base-en` (speech to text), `kokoro-int8-multi-v1` (text to speech). Piper and `kokoro-en-v0_19` were dropped: sherpa-onnx 2.0 removed espeak-ng, and those models then need a lexicon.
- **Compute:** CPU only. The prebuilt ARM64 build has no DirectML, so no GPU. The CLI has QNN options for QNN-format models; untested. NPU stays with the ORT-QNN phase.
- **Limitation:** the command line cannot carry non-ASCII text, so text to speech converts it to ASCII first.
- Code facts: `memories/repo/codebase-map.md`; open items: `memories/repo/known-issues.md`.

## 13. Image to image spike (2026-10-30)

- **SD 1.5 Q4 re-draw (`-i`, `--strength`):** 256 px, 10 steps, strength 0.6 took about 28 s; quality is rough. Needs `--batched-cfg off` even on CPU (blank image otherwise, verified).
- **FLUX.2 klein 4B edit (`-r`, `--sampling-method euler`):** 256 px, 4 steps took about 49 s; the edit was correct.
- **Z-Image Turbo** has no edit path.
- **Process model:** each job starts a fresh `sd-cli` that loads the model and releases it afterwards; a persistent `sd-server` is a possible later option.
- **Video:** the only disabled Playground tab (large Wan/Hunyuan models, frame-count rules).
- **Later idea:** a middle layer that converts other image types to jpeg for input.
- Code facts: `memories/repo/codebase-map.md`; open items: `memories/repo/known-issues.md`.

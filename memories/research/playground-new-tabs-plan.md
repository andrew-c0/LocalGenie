# Playground: next tabs (audio to audio, upscale, OCR)

Order chosen by the user: 1 audio to audio, 2 image upscaling, 3 OCR. One at a time: implement, user tests, commit, next. CPU only, Windows ARM64, curated model lists with licence on the card, like the existing tabs. Facts below marked "verify" are not checked yet.

## 1. Audio to audio (sherpa-onnx, already installed)

Same runtime as speech; the archive ships the programs, so there is no new install.
- `sherpa-onnx-offline-denoiser.exe`: `--speech-denoiser-gtcrn-model=<f> | --speech-denoiser-dpdfnet-model=<f> [--speech-denoiser-dpdfnet-attenuation-limit-db=N] --input-wav=<in> --output-wav=<out>`. Output is 16 kHz (`output_16k.wav`), so keep the name explicit in the UI.
- `sherpa-onnx-offline-source-separation.exe`: `--spleeter-vocals=<f> --spleeter-accompaniment=<f>` (Spleeter) or `--uvr-model=<f>` (UVR MDX-Net), plus `--input-wav`, `--output-vocals-wav`, `--output-accompaniment-wav`.
- One model cannot do both jobs, so the tab has a task switch: "Clean up speech" (denoise) and "Split voice and music" (separate). Same runtime, same panel, same output folder as speech.
- Release tags: `speech-enhancement-models` (single .onnx files: `gtcrn_simple` 0.5 MB, `dpdfnet4` 11.7 MB, `dpdfnet2` 10 MB, `dpdfnet8` 14.6 MB, `dpdfnet2_48khz_hr` 10.6 MB) and `source-separation-models` (`sherpa-onnx-spleeter-2stems-int8.tar.bz2` 48 MB, fp16 35 MB, UVR MDX-Net `.onnx` 30-67 MB).
- Curated three: GTCRN simple (fast, tiny), DPDFNet4 (better quality), Spleeter 2 stems int8. Verify licences (GTCRN, DPDFNet, Spleeter; UVR weights are unclear, so left out until checked).
- Backend: new model kinds besides stt/tts; downloads are single files (not only `.tar.bz2`) from the same two GitHub tags (extend the allowlist); a job that runs the program and returns the output wav paths (one for denoise, two for separate); reuse the speech job slot, events and `playground_read_audio`.
- UI: tab "Audio to audio": task switch, model cards, input (wav file or microphone, as in speech to text), run, one or two players with Show in folder, time summary.
- Spike: run GTCRN, DPDFNet4 and Spleeter on `speech_with_noise.wav` / `audio_example.wav`; record timings and sample rates; check input rate limits.

## 2. Image upscaling (stable-diffusion.cpp, already installed)

`sd-cli` has an upscale mode (`-M upscale --upscale-model <esrgan> -i <in> -o <out>`, also `--upscale-repeats`; verify flags with `--help`). ESRGAN-style models (`RealESRGAN_x4plus*.pth`, MoSR) are supported per `docs/esrgan.md`.
- Models: curate 2-3 (general x4, anime x4, a light one). Licences to verify per model. Check whether sd-cli reads `.pth` only or also GGUF/safetensors.
- Backend: image job variant with only input and output; fixed 4x; size/time warning for large inputs (cap input size). Output in Pictures\LocalGenie.
- UI: "Upscale" tab or a section in Image to image? Decide after the spike; start as its own tab with before/after.
- Spike: upscale a 256 px generated image on CPU, time it, check tiling for memory.

## 3. OCR

No OCR engine is installed. Options, to be spiked in this order:
- A. Windows built-in OCR (`Windows.Media.Ocr` via the `windows` crate): no download, ARM64 native, no licence issue, languages depend on installed packs. Likely the easiest first version; verify it works from Tauri's Rust side and on handwritten/low-quality text.
- B. A small ONNX OCR model (PaddleOCR / RapidOCR class) through ONNX Runtime: a new runtime (the plan's ORT), better layout, possible NPU later. Bigger.
- C. A vision model through GenieX (Qwen3-VL class): already in the app via chat, handles layout and handwriting, slow.
UI: image in, text out (copy, save .txt), maybe language choice.

## 1b. Voice cloning (sherpa-onnx Pocket TTS, in the Text to speech tab)

Added after audio to audio, at the user's request. Same runtime and program (`sherpa-onnx-offline-tts`).
- Spike: Pocket TTS int8 (98 MB `.tar.bz2`, `tts-models` tag) cloned a voice from `bria.wav`; 24 kHz output; RTF 0.38 on 1 thread, 0.26 on 4 threads. Needs a reference wav only (no transcript). English. ZipVoice (needs reference text, vocoder and lexicon; zh/en) was left out.
- Licence conflict: the archive `LICENSE` is CC-BY 4.0 but its README says the ONNX export is non-commercial. The card shows "Non-commercial (Kyutai Pocket TTS, ONNX export)" until checked.
- Contract: `SpeechModel.needsReference` (true for `pocket-tts-int8`, no voices); `SpeechSynthesizeRequest.referenceAudioPath` (wav). Voice and speed are ignored for it. The reference clip uses the shared audio slot, like audio to audio.
- Status: built and checked by tests and a real CLI run; not tested in the app by the user yet (see manual checklist).

## 2b. Image upscaling: spike and build result

- Spike: 256 px to 1024 px with `sd-cli -M upscale` took 107 s (Nomos2) and 143 s (anime 6B) on the old `arm64-77b72a2` build, but 10 s and 16 s on the newest fork build `arm64-0769f70` (CPU). GPU (OpenCL) aborts with `GGML_ASSERT(dst->extra)` in `ggml_cl_add` on every build tried, for both the mosr and the ESRGAN architecture, so the tab is CPU only. The fork has no code patches (upstream plus CI files), so a fix would mean patching upstream ggml.
- Models: `realesrgan-x4plus-anime-6b` (BSD-3-Clause), `nomos2-hq-mosr-x4` (CC-BY; the author writes "CC-BY-0.4"). Input png/jpg/jpeg, 30 MB and 1024 px longest side caps; output `upscaled-…png` in Pictures\LocalGenie.
- Status: built and checked by tests; NOT manually tested in the app yet (see manual checklist).

## 3b. OCR: spike and build result (route C, dedicated OCR VLMs through GenieX)

- Chosen with the user: dedicated OCR models run through the existing GenieX server (llama.cpp VLM), not a new runtime. Curated: PaddleOCR-VL 1.6 (`PaddlePaddle/PaddleOCR-VL-1.6-GGUF`, import precision label `BF16`, prompts `OCR:` / `Table Recognition:`, table tags converted to markdown) and MiniCPM-OCR 1.0 (`openbmb/MiniCPM-OCR-1.0-gguf`, Q4_K_M). Both Apache-2.0, each a GGUF plus a projector.
- Spike (900x520 invoice page, correct text from both): language model CPU + vision encoder CPU about 48 s; vision encoder on the NPU (`--vit-compute HTP0`) about 17 s; language model on NPU about the same total (decode slower, start sooner); GPU slowest. The only vision-encoder devices that work here are `CPU` and `HTP0`; `GPU`, `npu`, `HTP2`, `hybrid` fail with "Invalid input parameters". Defaults: language model CPU, vision encoder NPU.
- Build: backend downloads both files, imports with `geniex pull` (same path as `import_gguf`, source `hf`, so the model also shows in the Models tab), and runs a non-streamed chat completion on the running GenieX server with `compute` / `vit_compute`; pictures png/jpg/jpeg, 30 MB, 2500 px longest side.
- Status: built, unit tests pass; NOT manually tested in the app yet (see manual checklist). Not tested: photos, handwriting, other languages, dots.ocr (MIT, 1.9 GB + 1.3 GB projector).

## Status
Audio to audio: done, user-tested. Voice cloning, image upscaling and OCR: built and committed, user test pending. All three planned tabs are built.

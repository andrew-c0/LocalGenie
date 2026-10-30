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

## Status
Audio to audio: done, user-tested, committed. Voice cloning: built, committed, user test pending. Next: 2 image upscaling spike.

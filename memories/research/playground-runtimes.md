# Playground runtimes: research findings

Status: research only. No code for these runtimes exists yet. Covers Playground tasks 7 to 10 in `tasks-ordered.md` (image-to-image, text-to-image, audio, video). Task 3 (Playground scaffold) is separate and not committed.

Written 2026-10-28 for a later session. Items marked **unverified** were not tested on hardware.

## 1. GenieX: what it can and cannot do

Sources: `C:\Work\GenieX` docs and source.

- **Output:** text only. Chat completions return `content`, `reasoning_content`, and `tool_calls`. There is no image, audio, or video output.
- **Endpoints:** `/v1/chat/completions`, `/v1/completions`, `/v1/logits`, `/v1/decisions`, `/v1/models`, plus health, status and metrics. No embeddings or media endpoint.
- **Model types (SDK enum `geniex_ModelType`):** `LLM` and `VLM` only.
- **Input:** text for all models. Images for VLMs. Audio for VLMs on the `llama_cpp` runtime only (`input_audio`). QAIRT rejects audio.
- **Runtimes:** `llama_cpp` (GGUF from Hugging Face) and `qairt` (AI Hub QAIRT bundles, NPU only).

Conclusion: GenieX covers text generation and understanding (including image and audio *input* to a VLM). It cannot produce images, speech, or video.

## 2. Which Qualcomm AI Hub models GenieX can run

Sources: `C:\Work\ai-hub-models` (`src/qai_hub_models/models/*/manifest.yaml`, `common.py`, `cli/qai_hub_models_cli/fetch.py`, `.claude/triage/customer-faq.md`).

- **`geniex_qairt` (21 manifests):** Qwen3 family (0.6B, 1.7B, 4B, 4B-2507, 8B, VL 4B/8B), Llama 3.x and 3.1 (1B, 3B, 3B-SSD, 8B and regional variants), Falcon 3 7B, SmolLM2 1.7B, Qwen3-VL 4B/8B, and `huggingface_wavlm_base_plus`. These are downloadable QAIRT bundles that LocalGenie can use through the zip import flow.
  - `huggingface_wavlm_base_plus` is a speech backbone, not a generative model. Its float precision is disabled for GenieX because of an accuracy failure (WER 20.7 vs 6.83 benchmark).
- **`geniex_llamacpp` (17 manifests):** Gemma 4 E2B/E4B, GPT-OSS 20B, Granite 4.0 Micro, LFM2.5 1.2B, Ministral 3 3B, Phi-4 Mini, Qwen2.5-VL 7B, Qwen3 (0.6B, 1.7B, 4B, 4B-2507), Qwen3.5 (0.8B, 2B), Qwen3-VL 2B, SmolVLM2 2.2B, WavLM. These are GGUF builds run through `llama.cpp`.
  - `fetch.py` refuses to download these: it raises `AssetNotFoundError` and points to the model README. LocalGenie gets GGUF from Hugging Face instead.
- **Not on GenieX:**
  - `stable_diffusion_v1_5` and `stable_diffusion_v2_1`: precompiled QNN ONNX (runtime 5) and QNN context binaries (runtime 3). The manifests list no GenieX runtime. The AI Hub bundles for these are not GenieX-compatible.
  - `whisper_*`: `orchestrator_runtimes: voice_ai`. Not GenieX.

So the answer to "only some AI Hub models work through GenieX" is yes. Every GenieX-compatible model is text or VLM. Image, audio-generation and speech models use other runtimes.

## 3. Stable Diffusion on Qualcomm AI Hub (text-to-image)

Sources: `C:\Work\ai-hub-models\src\qai_hub_models\models\stable_diffusion_v2_1` (manifest, README), `C:\Work\ai-hub-apps\stable_diffusion_windows_py` (sample app).

- **Model:** Stable Diffusion v2.1 (and v1.5). Precision `w8a16`. Licence `creativeml-openrail-m`. Two generated outputs: 512×512 images.
- **Bundle (runtime 5, `PRECOMPILED_QNN_ONNX`):** `text_encoder.onnx`, `unet.onnx`, `vae.onnx`, each with a `*_qairt_context.bin`, plus `metadata.yaml`. The sample app expects exactly this layout.
- **Runtime:** ONNX Runtime with the QNN execution provider. `onnxruntime==1.24.4`, `onnxruntime-qnn==2.3.0`. The QNN backend is bundled with the package, so no separate QAIRT install is needed.
- **Pipeline (sample `demo.py`):**
  1. Tokenize the prompt with a CLIP tokenizer. The tokenizer is loaded at runtime from the Hugging Face repo `sd2-community/stable-diffusion-2-1`.
  2. Run the text encoder twice (prompt and empty prompt).
  3. Run the U-Net once per step, twice for classifier-free guidance (guidance scale 7.5). Default 20 steps.
  4. Euler v-prediction scheduler (`scheduler.py`, numpy, constants hardcoded for SD 2.1).
  5. Decode the latent with the VAE and save a PNG.
- **Quantization:** boundary tensors are uint16. The graphs wrap them in QuantizeLinear / DequantizeLinear nodes. The Python code reads the scale and zero point from the graph and quantizes or dequantizes at the boundary. A native port must reproduce this exactly.
- **Platform rules from the sample:**
  - Windows 11 on Snapdragon, native ARM64 Python. x64 Python under emulation breaks NPU access.
  - Install scripts add ARM64 Python, Git, and pip packages.
- **Version gap:** the sample's `info.yaml` pins `qaihm_version: 0.53.1`. We target AI Hub v0.65.0. Needs testing.
- **Tested device in sample:** Snapdragon X Elite CRD.

## 4. Whisper on Qualcomm AI Hub (speech-to-text)

Sources: `C:\Work\ai-hub-models\src\qai_hub_models\models\whisper_base\manifest.yaml`, `C:\Work\ai-hub-apps\whisper_windows_py`.

- Runtime: `voice_ai` (enum value 7). It is not GenieX.
- Sample app: encoder and decoder ONNX graphs driven by ORT QNN. Autoregressive decode in Python. Uses `transformers` for config, feature extractor and tokenizer; `sounddevice` for microphone; `scipy` for resampling; ffmpeg for audio files.
- Model variants: tiny, base, small, medium, large v3 turbo, plus quantized variants and distil-whisper.

## 5. Other runtimes (web research, not hardware-tested)

Sources: web search, plus the vendor docs listed below. Confidence is low unless noted.

| Need | Runtime | Install shape | Windows ARM64 / Snapdragon | Notes |
|---|---|---|---|---|
| Speech output and speech input | sherpa-onnx | Prebuilt Windows x64 archive plus voice-model downloads. No installer. | **unverified** | One runtime covers ASR and TTS. Piper and Kokoro voices run on it. Source was skill-registry pages, not the project's docs. |
| Speech input | whisper.cpp | Prebuilt Windows builds | CPU likely; Vulkan on ARM64 **unverified** | Simple ASR option. |
| Text-to-image | stable-diffusion.cpp | Windows binaries listed (check official releases) | Vulkan or CPU likely; ARM64 **unverified** | Loads SD 1.x, 2.x, SDXL from ckpt, safetensors or diffusers. Some GGUF builds from packagers fail to load. Vulkan on Adreno under Windows looked weak in one report. |
| Text-to-image on the NPU | ONNX Runtime + QNN EP (AI Hub SD bundles) | Native ARM64 ORT package; no separate QNN SDK since 1.18 | Documented for Windows ARM64 | This is the path of Qualcomm's own sample. Needs bundled tokenizer and scheduler. |
| Image generation | Ollama | Installer | **unverified**; Windows image generation status unclear | Reports conflict on whether Ollama generates images. Not a dependable base. |
| Image generation | ComfyUI | Python environment | No ARM64 evidence | Heavy setup, against the easy-install goal. |
| Text output (LLM) | llama.cpp | Via GenieX `llama_cpp` plugin | Runs on Windows ARM64 (CPU Q4_0 faster than Vulkan in one discussion) | Already covered by GenieX. |
| Image input, audio input | llama.cpp `mtmd` | Same as above | Same | Already covered by GenieX `llama_cpp`. |
| Speech output | llama.cpp TTS example | Built from source | **unverified** | An example, not a supported API. Status unknown. |

Vendor docs consulted:
- ONNX Runtime QNN EP: https://onnxruntime.ai/docs/execution-providers/QNN-ExecutionProvider.html
- onnxruntime-qnn: https://github.com/onnxruntime/onnxruntime-qnn
- stable-diffusion.cpp: https://github.com/leejet/stable-diffusion.cpp
- Qualcomm AI Hub Stable Diffusion Windows app: https://aihub.qualcomm.com/apps/stable_diffusion_windows (returned 404 when fetched; not read)

## 6. Local sample repo: `C:\Work\ai-hub-apps`

- Windows Python samples: `stable_diffusion_windows_py`, `whisper_windows_py`, `sam3_segmentation_windows_py`. Windows C++ samples: image classification, object detection, super resolution.
- Ubuntu Python samples and Android samples are out of scope for now.
- `tutorials/playground/evaluate.py` is a Whisper WER evaluator, not a Playground. Not relevant to our Playground page.
- Install shape of all Python samples: PowerShell scripts that install ARM64 Python, Git, ffmpeg and pip packages. This is what LocalGenie should avoid in the shipped product.

## 7. Proposed direction (not decided)

1. **Keep GenieX for text.** LLM and VLM for chat and vision understanding. Use the `qairt` bundles and GGUF from Hugging Face as today.
2. **Speech:** sherpa-onnx as the first non-GenieX runtime (TTS and ASR in one). Verify Windows ARM64 before committing.
3. **Image generation:**
   - Option A: stable-diffusion.cpp first, for the easiest install. Models from Hugging Face.
   - Option B: ONNX Runtime QNN EP with the AI Hub SD bundles, for NPU speed. Requires a native sidecar that reproduces the sample's QDQ handling, tokenizer and scheduler.
   - Likely order: A first, B later once the QNN path is proven.
4. **Architecture:** a runtime adapter in the backend, one per runtime. Each adapter has an installer (pinned, hashed binaries and models in the app data folder), a sidecar lifecycle like GenieX's, and an IPC contract. The Playground page gets one panel per model kind.
5. **Ask before any build:** whether to pursue the NPU image path at all, given the Python-only sample and the ARM64 install constraint.

## 8. Open questions

- Does `ort` (Rust) or the ORT C API register the QNN plugin library, as the Python sample does? Not checked.
- Do the AI Hub v0.65.0 SD bundles load on the installed `onnxruntime-qnn`? The sample pins 0.53.1.
- Does sherpa-onnx ship a Windows ARM64 build? Not checked.
- Does stable-diffusion.cpp run acceptably on Adreno or CPU on Snapdragon X Elite? Not checked.
- Is video generation in scope at all? No runtime was found that fits the easy-install goal.
- Where does the CLIP tokenizer for SD come from in a shipped build: bundled with the model, or downloaded from Hugging Face on first run?

## 9. Next steps when resuming

1. Spike sherpa-onnx TTS on Windows ARM64: download the prebuilt archive, run one voice, measure.
2. Spike stable-diffusion.cpp on Windows ARM64 with one SD 1.5 or 2.1 checkpoint from Hugging Face. CPU first.
3. If the NPU path is wanted: download one AI Hub SD v0.65.0 zip from the bucket, check it against the sample's file layout, and load `text_encoder.onnx` through the QNN EP from a small native program.
4. Decide the first Playground model kind based on spike results.

## 10. Round 2 (2026-10-28, web research, nothing hardware-tested)

Corrects or extends sections 5 and 7. Sources are linked inline; blog and wiki pages are marked.

### Candidate runtimes against the "one runtime, CPU + GPU + NPU" goal

| Runtime | Model types | CPU | GPU | NPU (Snapdragon X, Windows ARM64) | Verdict |
|---|---|---|---|---|---|
| [ONNX Runtime + QNN plugin EP](https://onnxruntime.ai/docs/execution-providers/QNN-ExecutionProvider.html) | Anything exported to ONNX: Whisper, SD, ESRGAN, TTS, VAD, segmentation | ORT CPU EP | QNN EP GPU backend, or DirectML (legacy) | QNN EP (HTP). Qualcomm docs: [X / X2 run QNN-EP on NPU, GPU, CPU plus ORT CPU EP](https://docs.qualcomm.com/bundle/publicresource/topics/80-62010-1/ort.html) | **Best "all three, many model types" fit.** The AI Hub bundles are built for it. Cost: each model needs its own pipeline code (tokenizer, scheduler, quantization). |
| [Windows ML](https://learn.microsoft.com/en-us/windows/ai/new-windows-ml/supported-execution-providers) | Same as ORT (it is a system-managed ORT) | Included | DirectML (legacy), WebGPU EP (experimental) | QNN EP downloaded on demand, Windows 11 24H2+, X Elite / X Plus, NPU driver 30.0.140.0+ | Same capability as ORT, plus EP download and selection by the OS (PREFER_NPU, PREFER_GPU, fallback to CPU per secondary sources). Needs the Windows App SDK; C#/C++/WinRT API, awkward from Rust. **Unverified:** Rust access. |
| [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) | Text-to-image, image edit (Kontext, Qwen Image Edit), ESRGAN upscale, **video** (Wan 2.1/2.2, LTX-2.3/2.5, HunyuanVideo 1.5, MiniMax-H3). README news to 2026/10/16 | Yes | Vulkan, OpenCL, CUDA, SYCL (upstream list) | Not upstream. Community path: [DiT on Hexagon via ggml-hexagon](https://github.com/Zimo41650079726sub/Snapdragon-ImageGeneration-NPU) for FLUX.2 klein 4B and Z-Image-Turbo only | **Best single runtime for image and video generation.** NPU is partial and experimental. |
| [sherpa-onnx](https://k2-fsa.github.io/sherpa/onnx/index.html) | ASR (Zipformer, Whisper, Moonshine, SenseVoice, Parakeet), TTS (VITS, Kokoro, Matcha, Piper, Kitten), VAD, speech enhancement, source separation, diarization, language ID. No voice conversion | Yes | CUDA only; no DirectML mentioned | QNN pages exist but the guide is [Android-only (SM8350+)](https://k2-fsa.github.io/sherpa/onnx/qnn/index.html); prebuilt QNN models target SM8850. Windows ARM64 wheels and libs exist ([PyPI](https://pypi.org/project/sherpa-onnx/)) | **Best single runtime for audio breadth** (ASR, TTS, enhancement, separation, VAD in one SDK, with C, Rust, WebSocket APIs). NPU on Windows unproven. |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | ASR only | Yes | Vulkan, CUDA, OpenVINO; [Vulkan driver pick-up on Snapdragon needed manual ICD config](https://forum.shotcut.org/t/support-gpu-accelerated-whisper-on-more-platforms/51218) | No QNN backend found | Narrower than sherpa-onnx (which also runs Whisper). Skip unless sherpa-onnx fails. |
| llama.cpp (via GenieX) | Text, VLM, audio input | Yes | [OpenCL on Adreno X85, verified on Windows 11 Arm64](https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/OPENCL.md) | Upstream Hexagon backend (needs a Microsoft-signed HTP library, as in the Hexagon repo above) | Already in the app. Its ggml core is what stable-diffusion.cpp shares, so Hexagon and OpenCL work flows into both. |

### New facts that change the picture

1. **Genie (QAIRT) is gaining media support.** [QAIRT revision history](https://docs.qualcomm.com/doc/80-63442-10/topic/general_revision_history.html): 2.49.0 (July 2026) "Added LVM text-to-image generation support for Stable Diffusion 3.0" and "Added audio encoder support"; 2.50.0 (Aug 2026) "Windows support for OpenAI compatible APIs"; 2.47.0 "GPU engine on Windows". GenieX docs still describe only LLM and VLM and no roadmap was found. If GenieX exposes Genie's LVM path, text-to-image on the NPU could arrive through the runtime we already ship. **Ask the GenieX team / watch its releases.** This could change the plan.
2. **An NPU path for diffusion exists without the AI Hub bundles.** The community Hexagon repo (MIT) runs FLUX.2 klein 4B (4 steps) and Z-Image-Turbo (8 steps) DiT on the NPU through stable-diffusion.cpp, text encoder and VAE on CPU. 512x512: about 51 s NPU vs about 125 s CPU (2.5x), on one Dell XPS 13 (X Elite, v73). No admin or test mode for the main path (library signed via GenieX SDK). It builds from source with VS 2026, and is tied to specific GenieX and llama.cpp versions. Single-author, one device: treat as a proof of concept.
3. **stable-diffusion.cpp has Windows ARM64 builds, but only from forks.** The mpulukkinen fork publishes [ARM64 OpenCL (Adreno)](https://github.com/mpulukkinen/stable-diffusion.cpp/releases/tag/arm64-opencl-657d6c7) and [ARM64 Vulkan](https://github.com/mpulukkinen/stable-diffusion.cpp/releases/tag/arm64-vulkan-01e93b0) releases. Upstream releases were not checked for ARM64. A fork would have to be pinned or built in CI by us. Whether `sd-server` (HTTP API) exists upstream was not confirmed from the README.
4. **Video is runnable but heavy.** stable-diffusion.cpp supports Wan 2.1 T2V 1.3B and 14B, I2V, FLF2V, VACE, with GGUF, VAE tiling and flash attention ([DeepWiki, secondary](https://deepwiki.com/leejet/stable-diffusion.cpp/5.6-video-generation)). A downstream app uses frame counts 4k+1, sizes multiple of 16, a worker process with progress and cancel, and ffmpeg-style MP4 output ([localm PR](https://github.com/Matlan1/localm/pull/2235), secondary). No NPU path, no benchmarks found. Video-to-text: no dedicated runtime found; a VLM that accepts frames through GenieX is the practical route.
5. **Image-to-image is split.** Style transfer or upscale models (Real-ESRGAN etc.) exist as AI Hub ONNX / QNN_DLC exports ([Real-ESRGAN-x4plus](https://huggingface.co/qualcomm/real-esrgan-x4plus)) and run on ORT QNN. Diffusion img2img / edit is in stable-diffusion.cpp (README lists edit models; plain img2img not stated on the README page, verify in `sd-cli --help`).
6. **Audio-to-audio.** sherpa-onnx covers speech enhancement and source separation. Music stem separation (HT-Demucs) and voice conversion (RVC) run on ORT/PyTorch only ([ONNX export blog, vendor](https://stemsplit.io/blog/htdemucs-ft-onnx-export)); no NPU evidence.
7. **Versions to pin.** AI Hub release notes (2026-09-28): ORT 1.30 and QNN EP 2.50. SD 2.1 precompiled ONNX targets QAIRT 2.45 with ORT 1.27.1 ([HF](https://huggingface.co/qualcomm/Stable-Diffusion-v2.1)). The sample app pins older ORT 1.24.4 / QNN 2.3.0, so the AI Hub bundle version and the EP version must match.

### Coverage by model type (best option today)

| Model type | Best runtime | CPU | GPU | NPU |
|---|---|---|---|---|
| text/image/audio to text | GenieX (have) | yes | yes | yes |
| text-to-image | stable-diffusion.cpp | yes | Vulkan / OpenCL | partial (FLUX.2 klein, Z-Image via Hexagon, community) or ORT QNN SD bundles |
| image-to-image / edit | stable-diffusion.cpp (diffusion), ORT QNN (ESRGAN-class) | yes | yes | ORT QNN only |
| audio-to-text | sherpa-onnx (Whisper, Moonshine, Zipformer) or ORT QNN with AI Hub Whisper | yes | limited | ORT QNN yes (AI Hub); sherpa-onnx unproven on Windows |
| text-to-audio | sherpa-onnx (Kokoro, Piper, VITS) | yes | CUDA only | no evidence for TTS |
| audio-to-audio | sherpa-onnx (enhancement, separation) | yes | no | no evidence |
| text-to-video / image-to-video | stable-diffusion.cpp (Wan, LTX) | yes (slow) | Vulkan / OpenCL | none |
| video-to-text | GenieX VLM on sampled frames | yes | yes | yes |

### Reading of the results

- No single runtime reaches CPU, GPU and NPU for every model type. The nearest is **ONNX Runtime + QNN EP**: all three computes and all ONNX-exportable families, but we write and maintain per-model pipelines.
- Practical plan: **three runtimes in addition to GenieX**: stable-diffusion.cpp (image, edit, video), sherpa-onnx (speech and audio), ORT-QNN (NPU-only add-ons: AI Hub Whisper, ESRGAN, SD bundles). Start with the first two for CPU/GPU, and add ORT-QNN only for NPU gaps.
- Risks: all three claims of Windows ARM64 NPU support for sherpa-onnx and stable-diffusion.cpp upstream are unverified; Hexagon needs signed libraries; versions move monthly.

### Decisions (user, 2026-10-28)

1. NPU is preferred but not a hard requirement per model. Keep compatibility with the text setup. Open-source engines that compile to ARM64 and reach the NPU are acceptable candidates (ONNX Runtime QNN EP, ggml-hexagon in llama.cpp / stable-diffusion.cpp, the community Hexagon repo).
2. Runtimes are installed by the user, as an optional step in Settings (like the GenieX CLI install). LocalGenie provides the download and pre-/post-install configuration so the runtime works with the app.
3. Target is Snapdragon X on Windows ARM64 only.
4. The user will research GenieX / Genie text-to-image themselves. Do not plan around it yet. Source: QAIRT revision history, entry 2.49.0, Genie, "Added LVM text-to-image generation support for Stable Diffusion 3.0" (https://docs.qualcomm.com/doc/80-63442-10/topic/general_revision_history.html). Windows ARM64 applicability not confirmed.

## Related

- `tasks-ordered.md`: tasks 7 to 10 (not edited here).
- `memories/geniex-cli-reference.md`: GenieX CLI flags.
- Local repos used: `C:\Work\GenieX`, `C:\Work\ai-hub-models`, `C:\Work\ai-hub-apps`.

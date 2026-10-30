# Runtime and compute compatibility

Which runtime runs which model type in LocalGenie, and on which compute unit it works. Windows ARM64 (Snapdragon X Elite, Oryon CPU, Adreno X1-85 GPU, Hexagon NPU). Measured on that machine unless marked otherwise; "not tried" means nothing was run, not that it fails. Details of each issue live in `known-issues.md`; the test steps in `manual-checklist.md`.

Legend: **yes** = works and is offered in the app. **works, not offered** = runs in a manual test but the app does not expose it. **no** = fails or is not supported. **not tried** = untested.

## Runtimes

| Runtime | Installed from | Runs | Used by |
|---|---|---|---|
| GenieX CLI and server (llama.cpp and QAIRT backends) | The GenieX installer | Language and vision-language models | Chat, Benchmarks, OCR |
| stable-diffusion.cpp (`sd-cli`, our fork `andrew-c0/stable-diffusion.cpp`, upstream code plus CI files) | Settings > Runtimes | Diffusion image models and ESRGAN upscalers | Text to image, Image to image, Image upscaling |
| sherpa-onnx (prebuilt `shared-MT-MinSizeRel`) | Settings > Runtimes | ONNX speech models | Speech to text, Text to speech (incl. voice cloning), Audio to audio |

## Matrix

| Model type | Runtime | Models in the app | CPU | GPU (Adreno) | NPU (Hexagon) |
|---|---|---|---|---|---|
| Chat LLM / VLM (GGUF) | GenieX, llama.cpp | Any GGUF the user downloads | yes | yes | yes (Q4_0 has the best support); `hybrid` also exists |
| Chat LLM (Qualcomm AI Hub, QAIRT) | GenieX, QAIRT | AI Hub catalog downloads | no | no | yes (NPU only by design) |
| OCR (VLM, GGUF + projector) | GenieX server, llama.cpp | PaddleOCR-VL 1.6, MiniCPM-OCR 1.0 | yes | works for PaddleOCR-VL, but the slowest; MiniCPM-OCR not tried | works for both; decodes slower than the CPU but starts sooner |
| OCR vision encoder (the picture-reading part) | GenieX server | same | yes (`CPU`) | no | yes (`HTP0`); about 3x faster than CPU |
| Text to image | stable-diffusion.cpp | SD 1.5, FLUX.2 klein 4B, Z-Image Turbo (Q4) | yes (default) | works, not offered by default: slower than the CPU, blank images with CFG above 1 unless `--batched-cfg off` | no |
| Image to image | stable-diffusion.cpp | SD 1.5 (re-draw), FLUX.2 klein 4B (instruction edit) | yes | not tried here; needs `--batched-cfg off` (always applied) | no |
| Image upscaling | stable-diffusion.cpp | Real-ESRGAN anime 6B, 4xNomos2 | yes (about 10 to 16 s for 256 px to 1024 px, newest build) | no: aborts with `GGML_ASSERT(dst->extra)` in the OpenCL add kernel | no |
| Speech to text | sherpa-onnx | Whisper tiny.en, Moonshine base | yes | no | not tried |
| Text to speech, voice cloning | sherpa-onnx | Kokoro multi-lang (voices), Pocket TTS (cloning) | yes | no | not tried |
| Audio to audio (denoise, split) | sherpa-onnx | GTCRN, DPDFNet4, Spleeter 2 stems | yes | no | not tried |

## Why some cells are missing

- **sherpa-onnx GPU:** the prebuilt ONNX Runtime has no DirectML provider, so there is no GPU path. A custom ONNX Runtime build could add one; not planned.
- **sherpa-onnx NPU:** the CLI has QNN options, but they need QNN-format models (context binaries) and the QNN libraries. The curated models are plain ONNX. Not tried, not offered.
- **stable-diffusion.cpp NPU:** upstream has no Hexagon backend. A community fork runs two models (FLUX.2 klein, Z-Image Turbo) on the NPU through ggml-hexagon; it is not in our fork.
- **stable-diffusion.cpp GPU:** the OpenCL backend runs, but is slower than the CPU on the models tried, gives blank images when batched CFG is on, and crashes in the upscaler. The cause inside ggml-opencl is not confirmed; re-test after fork syncs. The app defaults to the CPU and the compute help text warns about the GPU.
- **OCR vision encoder on GPU:** GenieX accepts only `CPU` and `HTP0` here. `GPU`, `gpu`, `npu`, `HTP2` and `hybrid` all fail with "Invalid input parameters". The CLI reference lists `HTP2` as an example; it does not hold on this machine.
- **Video:** dropped. Video models (Wan, LTX, HunyuanVideo) are too heavy for local runs on this hardware and the tab is gone.
- **AI Hub QAIRT on CPU or GPU:** a QAIRT bundle is built for the NPU. The CLI reference says an explicit device list is coerced to the NPU with a warning; running one on CPU or GPU was not tried.

## Notes on reading this table

- Timings are one run on one machine; treat them as rough. OCR figures are for a 900x520 test page.
- The NPU/GPU cells for OCR come from `geniex infer` runs; the app sends the same settings per request to the server (`compute`, `vit_compute`), which is not verified end to end yet.
- Update this file when a runtime, a model or a compute path changes. Keep reasons here and the details in `known-issues.md`.

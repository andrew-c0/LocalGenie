# LocalGenie open tasks, easiest to hardest

Source: `tasks.md`. Done items are removed; what is done and what was dropped is listed at the end. Estimates are rough, from the wording and the current code. Ordered by complexity and time, easiest first, with dependencies noted. Nothing here has been started.

| # | Task | Estimate | Why |
|---|------|----------|-----|
| 1 | Move the GenieX update card from Application & Runtime to the Runtimes settings | Small | `CliUpdateCard` is one self-contained card in `AppSettings`; the Runtimes section already exists. Mostly moving a component, plus the update badge on the settings tab. |
| 2 | Default context window of 8K instead of the model's maximum, and a RAM estimate that updates as the context is edited | Small to medium | The default is a change in `resolveLoadParams` / `contextWindowFor` and the Load section display (today `saved ?? native`). The estimate needs no new backend: the stored base RAM plus the existing `get_context_memory` figure for the typed context. |
| 3 | Compute usage graph for Playground jobs | Medium | The sidebar chart follows the GenieX model's compute; the CPU, GPU and NPU counters are system-wide, so the chart can be reused. The work is mapping each Playground tab's device (sd-cli device, sherpa CPU, OCR compute) to a chart target while a job runs. Memory per process is not tracked for `sd-cli` or sherpa-onnx. |
| 4 | Research: more information per model (replacing the chips for Hugging Face) | Medium | Research first: which Hub fields exist and are worth showing (facets, safetensors and GGUF metadata, licence, tags are partly read already), then a card redesign. Open-ended on what counts as useful. |
| 5 | Automatic collapse and open of the main menu when a page shows its own submenu | Medium | Needs a collapsible sidebar with state and a rule for when a page owns a submenu (Settings, Benchmarks, Playground tabs). Overlaps with item 7: if submenus go away, this may not be needed, so decide after item 7. |
| 6 | Sort local downloaded models into horizontal sections by destination (chat, Playground tabs) | Medium to large | The Models page lists only GenieX models. Playground models (image, upscaling, speech, audio) live in their own catalogs and folders, outside GenieX, so the page must merge those catalogs and their delete and download actions. OCR models are the exception, being imported into GenieX. |
| 7 | Breadcrumbs on every page, no submenus, with the old submenus as items on a landing page (Windows Settings style) | Large | Touches routing and every page that has tabs today (Models 3, Playground 8, Benchmarks 5, Settings sections). Needs a landing page per section, breadcrumb state, and the page-level navigation rewritten. |
| 8 | Playground redesign: better organised tools and use of space | Large | Design-heavy across eight tabs. Best done after item 7, because the new section landing page decides how the Playground tools are laid out. |
| 9 | Research adding native tools (web search, file explorer) with user consent | Large | Needs a consent and approval design before any tool runs, then tool execution, a permission model and a settings page that shows and toggles the tools. Open-ended; touches safety. |
| 10 | Research agentic mode, similar to OpenClaw or Atomic Agent | Largest | Broad; touches tools, planning and safety. Depends on item 9 (tools) and the finished compaction, so it comes last. |

Smaller follow-ups to compaction, not started: a per-chat override and a "Compact now" button; stripping `<think>` blocks from the normal history; a database-level guard so `delete_message` refuses rows a summary covers (today only the UI, store and retry refuse); keeping error text out of the history sent to the model.

## Done (removed from the list)
- Qualcomm AI Hub models in downloads (merged in PR #2, not tested).
- Code quality analysis and agent updates (merged in PR #2, not tested).
- Playground page and the model-type research, tested there: text to image, image to image, text to speech, speech to text, audio to audio, image upscaling and OCR (the last two tested in the app on 2026-10-31).
- RAM estimate per downloaded model, the RAM headroom setting with its slider and memory bar, and the selector warning (tested).
- Optional automatic conversation compaction (off by default, threshold 70%): tested by the user on 2026-11-02 (summary at the threshold, summary row, second summary). The context ring and the trigger now sum every message, since the server's `prompt_tokens` counts only the tokens processed for a request. Checklist in `memories/repo/manual-checklist.md`.
- Bugs from `tasks.md`, fixed and tested by the user on 2026-11-03: custom context size not saved (typed numbers in number fields were lost), chat scrolling pulled back to the bottom while a reply streams (a little jitter remains), no guard against downloading the same quant twice, models loading only on CPU (the per-model compute setting is removed; the top dropdown decides), and the RAM estimate computed when the dropdown opens (now stored in the database per model, filled at import).
- Built, not tested in the app: voice cloning in Text to speech (Pocket TTS). Steps in `memories/repo/manual-checklist.md`.
- Runtime and compute compatibility is written up in `memories/repo/runtime-compatibility.md`.

## Scrapped
- Run multiple models at once on the CLI (one per compute, each on its own server port). Scrapped on 2026-10-31 because the computes share memory bandwidth, so models running side by side would slow each other down; not worth it yet. It was built and tested (per-port servers, per-compute port settings, a multi-load selector with an active model) and then reverted. Kept from that work: the RAM estimate per downloaded model and the RAM headroom setting. Findings and risks: `memories/research/multi-model-plan.md`; the server test results: `memories/repo/geniex-server-behaviour.md`. Revisit if bandwidth turns out not to matter for the intended pairings.

## Dropped
- Video models (text-to-video, video-to-text): the Playground Video tab was removed. Too heavy for this hardware. Video-to-text with a vision-language model through GenieX was never looked into.

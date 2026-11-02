# LocalGenie open tasks, easiest to hardest

Source: `tasks.md`. Done items are removed; what is done and what was dropped is listed at the end. Estimates are rough, from the wording and the current code. Ordered by complexity and time, easiest first. Nothing here has been started.

| # | Task | Estimate | Why |
|---|------|----------|-----|
| 1 | Research adding native tools (web search, file explorer) with user consent | Large | Needs a consent and approval design before any tool runs, then tool execution, a permission model and UI. Open-ended; touches safety. |
| 2 | Research agentic mode, similar to OpenClaw or Atomic Agent | Largest | Broad; touches tools, planning and safety. Depends on item 1 (tools) and the finished compaction, so it comes last. |

Smaller follow-ups to compaction, not started: a per-chat override and a "Compact now" button; stripping `<think>` blocks from the normal history; a database-level guard so `delete_message` refuses rows a summary covers (today only the UI, store and retry refuse); keeping error text out of the history sent to the model.

## Done (removed from the list)
- Qualcomm AI Hub models in downloads (merged in PR #2, not tested).
- Code quality analysis and agent updates (merged in PR #2, not tested).
- Playground page and the model-type research, tested there: text to image, image to image, text to speech, speech to text, audio to audio, image upscaling and OCR (the last two tested in the app on 2026-10-31).
- RAM estimate per downloaded model, the RAM headroom setting with its slider and memory bar, and the selector warning (tested).
- Optional automatic conversation compaction (off by default, threshold 70%): tested by the user on 2026-11-02 (summary at the threshold, summary row, second summary). The context ring and the trigger now sum every message, since the server's `prompt_tokens` counts only the tokens processed for a request. Checklist in `memories/repo/manual-checklist.md`.
- Number fields in the settings pages saved only arrow-button changes, not typed values (fixed with `spinNumber`).
- Built, not tested in the app: voice cloning in Text to speech (Pocket TTS). Steps in `memories/repo/manual-checklist.md`.
- Runtime and compute compatibility is written up in `memories/repo/runtime-compatibility.md`.

## Scrapped
- Run multiple models at once on the CLI (one per compute, each on its own server port). Scrapped on 2026-10-31 because the computes share memory bandwidth, so models running side by side would slow each other down; not worth it yet. It was built and tested (per-port servers, per-compute port settings, a multi-load selector with an active model) and then reverted. Kept from that work: the RAM estimate per downloaded model and the RAM headroom setting. Findings and risks: `memories/research/multi-model-plan.md`; the server test results: `memories/repo/geniex-server-behaviour.md`. Revisit if bandwidth turns out not to matter for the intended pairings.

## Dropped
- Video models (text-to-video, video-to-text): the Playground Video tab was removed. Too heavy for this hardware. Video-to-text with a vision-language model through GenieX was never looked into.

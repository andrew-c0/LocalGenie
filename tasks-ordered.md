# LocalGenie open tasks, easiest to hardest

Source: `tasks.md`. Done items are removed; what is done and what was dropped is listed at the end. Estimates are rough, from the wording and the current code. Ordered by complexity and time, easiest first. Nothing here has been started.

| # | Task | Estimate | Why |
|---|------|----------|-----|
| 1 | Run multiple models at once on the CLI | Small to find out, large to build | Start with a short check of what the GenieX server supports. If it cannot hold several models, the task is blocked and ends there. The app runs one server and unload-all is the only unload path, so a real build would touch loading, status and the model selector. |
| 2 | Automatic conversation compaction (if enabled) | Large | One bounded feature: a summary call through the model, storage of the summary, and changes to history and retry. No new design question beyond the trigger and the setting. |
| 3 | Research adding native tools (web search, file explorer) with user consent | Large | Needs a consent and approval design before any tool runs, then tool execution, a permission model and UI. Open-ended; touches safety. |
| 4 | Research agentic mode, similar to OpenClaw or Atomic Agent | Largest | Broad; touches tools, planning and safety. Depends on item 2 (compaction) and item 3 (tools), so it comes last. |

## Done (removed from the list)
- Qualcomm AI Hub models in downloads (merged in PR #2, not tested).
- Code quality analysis and agent updates (merged in PR #2, not tested).
- Playground page and the model-type research, tested there: text to image, image to image, text to speech, speech to text, audio to audio. Also built: voice cloning, image upscaling and OCR (not tested in the app yet; see `memories/repo/manual-checklist.md`).
- Runtime and compute compatibility is written up in `memories/repo/runtime-compatibility.md`.

## Dropped
- Video models (text-to-video, video-to-text): the Playground Video tab was removed. Too heavy for this hardware. Video-to-text with a vision-language model through GenieX was never looked into.

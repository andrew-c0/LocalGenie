# LocalGenie open tasks, new order

Source: `tasks.md`. Done items are removed. Estimates are rough, from the wording and the current code. Nothing here has been started.

The model-type research (image, audio and video) moves later. It will be tested in a new **Playground** page, separate from Chat, where each specific model can be tried out for its functionality. Playground is added as its own item so the research has a place to run.

| # | Task | Estimate | Why |
|---|------|----------|-----|
| 1 | ~~Research integrating Qualcomm AI Hub models into downloads~~ **Done, not tested** (merged in PR #2) | Medium | AI Hub code is legacy in the repo (see `CLAUDE.md`), so this needs a decision on whether to revive it. |
| 2 | ~~Code quality analysis, plus agent and instruction updates~~ **Done, not tested** (merged in PR #2) | Medium | Concrete work over the repo; scope depends on how much is in one pass. |
| 3 | **In progress: scaffold only** (route `/playground`, sidebar entry, placeholder page). Design still to agree: Playground test specific models' functions, separate from Chat | Medium-large | New page and routes, a model picker, and per-function panels. The first version can start with text, then add media as the research lands. |
| 4 | Research adding native tools (web search, file explorer) with user consent | Large | Needs a consent and approval design before any tool runs. |
| 5 | Automatic conversation compaction (if enabled) | Large | Summary call through the model, storage of the summary, and changes to history and retry. |
| 6 | Research agentic mode, similar to OpenClaw or Atomic Agent | Large | Broad; touches tools, planning and safety, so it depends on item 5. |
| 7 | Research image-to-image models (style transfer), tested in Playground | Medium | Narrow question, but it needs Playground (item 4) to try the models. |
| 8 | Research text-to-image models, tested in Playground | Medium | Output handling and runtime support have to be checked against GenieX. |
| 9 | Research text-to-audio, audio-to-text and audio-to-audio models, tested in Playground | Medium | Several model families; audio output is new to the app. |
| 10 | Research video-to-text and text-to-video models, tested in Playground | Medium | Large models and new media handling; likely heavy on hardware limits. |
| 11 | Run multiple models at once on the CLI | Large | Blocked on what GenieX supports; the app runs one server with unload-all as the only unload path. |

## Suggested first picks
Items 1 and 2 are research or small work that can be done in one session. Item 3 is the next feature after them. Items 4 to 6 depend on the native tools decision. Item 11 waits on GenieX.

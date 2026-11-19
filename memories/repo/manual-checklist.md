# Manual checklist (after build / deployment)

Run through these checks manually after building or deploying the app. Automated checks cannot fully verify installer behavior, filesystem permissions, or OS-level interactions.

Only untested items are kept (tested ones were removed 2026-11-18; see git history and known-issues.md). Items are grouped by page and sub-page. Tags: **[needs you]** = needs your hands or machine (installer, updater, offline, notifications, tray, hardware); **[needs download/network]** = needs a model, runtime or the internet. Untagged items can be checked in the app with a loaded model.

## Overview

- [ ] Overview: with GenieX removed, Browse Models and Start Local Chat are disabled with the tooltip; "Models Installed" shows "—"; the "Open Runtimes" block opens Settings > Runtimes. **[needs you]**

## Models

### Landing


### Local

- [ ] Delete from the Playground models page: the model leaves the list and the tool's selector; a file shared with another downloaded model (the Qwen3-4B encoder) is kept while the other model is installed. (The dialog showing the size and the shared-files note was seen, and cancelled.) **[needs download/network]**

### Hugging Face

- [ ] Models: search → download → import → progress → completion refresh; cancel and resume from the drawer; duplicate click is ignored; Load & Chat sets active model; remove confirmation works; repo filter chips behave. **[needs download/network]**

### AI Hub

- [ ] AI Hub first load: with the cache empty (first open after start), time from opening the tab to the cards with their info lines. Record the time; the list waits for every info file. **[needs download/network]**
- [ ] Models > Qualcomm AI Hub lists models with runtime 11 or 12 and a runnable asset; the name filter and the domain chips narrow the list; the list loads with no network error. **[needs download/network]**
- [ ] A runtime 12 (GGUF) asset downloads through the Hugging Face pipeline, imports, and the model loads; a runtime 11 zip imports and loads (runtime 2, 3 and 6 are not listed). **[needs download/network]**
- [ ] Open a model: domain, licence, model card and QAIRT assets load. With the assets unreadable, the page shows "Assets unavailable" and the model info still shows. **[needs download/network]**
- [ ] With GenieX's `chipset` set to this device's chipset: a universal asset and this chipset's asset download. Another chipset's asset is refused with a "Download failed" toast. **[needs download/network]**
- [ ] A download runs in the drawer, then "Model ready"; the zip and its `aihub--<id>` folder are gone from Downloads. A failed import keeps the zip, and Resume reuses it. **[needs download/network]**
- [ ] After a restart, the imported model is listed under Local, and `list_models` reports its `source` as `aihub` (check the value in the dev console). **[needs download/network]**

### Playground models page

Download each model and run it once.

- [ ] SDXL base (Q4) **[needs download/network]**
- [ ] SDXL-Turbo (Q8) **[needs download/network]**
- [ ] FLUX.1 schnell **[needs download/network]**
- [ ] Real-ESRGAN x4plus **[needs download/network]**
- [ ] 4xNomosWebPhoto **[needs download/network]**
- [ ] 4xNomos8kSC **[needs download/network]**
- [ ] Qwen3-VL-2B (OCR) **[needs download/network]**
- [ ] dots.ocr (OCR) **[needs download/network]**
- [ ] DeepSeek-OCR (OCR) **[needs download/network]**
- [ ] Whisper base.en, base, small.en and turbo **[needs download/network]**
- [ ] Piper voices (Lessac, GLaDOS, LibriTTS-R) **[needs download/network]**
- [ ] Matcha LJSpeech **[needs download/network]**
- [ ] Kitten nano **[needs download/network]**

### Model cards and detail pages

- [ ] Card layout and clipping: at narrow widths (down to the 860 px sidebar collapse) titles, capability icons, fact items and the RAM badge wrap or truncate without overlapping. Long model names truncate with the full name in the tooltip. **[needs download/network]**
- [ ] Tooltips: hover and keyboard focus on each info icon (updated, details), each fact (task, params, quantisation, context, licence, disk), the RAM badge and the Hub downloads and likes; the text matches the card. **[needs download/network]**
- [ ] AI Hub card for a model whose info file cannot be read: the row shows with the `QAIRT · N chipsets` line. **[needs download/network]**
- [ ] AI Hub detail: the sections hide when a model has nothing for them; the research paper link opens in the browser. (Capabilities, Specifications and About showing for Gemma-4-E2B-it, with no TTFT or Response Rate, were seen.) **[needs download/network]**
- [ ] Hugging Face detail: with the second (`expand[]`) request blocked, the page still loads and the two counts are missing. (The Specifications fields were seen.) **[needs download/network]**
- [ ] The installed model card's info tooltip reads "Source: Hugging Face" for `hf` and "Source: Qualcomm AI Hub" for `aihub`. (The stored Specifications were seen.) **[needs download/network]**
- [ ] Hugging Face page link on a model detail opens in the system browser (through `openExternal`), not in the app window. **[needs download/network]**

## Chat

### Messages and conversations

- [ ] Chat: retry removes later messages in both Zustand and SQLite. (Streaming and the generation stats under a reply were seen.)
- [ ] Pin: a pinned conversation keeps its place after a reload. (Listing first, and unpin returning it to recency order, were seen.)

### Attachments

- [ ] Send an image and an mp3 clip (mp3 is not verified with the server; see known-issues). The reply uses the content; a wav clip is the verified path.
- [ ] Delete that message (hover the bubble, trash icon, confirm): the message and every later one leave the chat and do not come back after a reload. The next send has no warning and the model no longer gets the file.
- [ ] Delete a user message in the middle of a chat, then an assistant message: each confirm removes it and all after it, and the context ring drops accordingly. A cancelled confirm changes nothing.
- [ ] Retry and Delete buttons appear only on hover or keyboard focus, and Retry is absent on a message whose file has no stored path.
- [ ] Open a tile, then "Open location": Explorer opens the folder with the file selected.
- [ ] Retry on the last user message re-sends its files; a reply that reports counts shows the exact total in the ring.
- [ ] A chat image attachment opens in the same dialog, with Open location. Audio and text attachments open as before.

### Compaction

- [ ] With it off, a prompt over the context shows the usual error. No summary, no button.
- [ ] Clicking that line (mouse and keyboard) opens and closes the summary text. The summary has no thinking text and reads as bullet points.
- [ ] Delete and Retry are gone on the summarised messages and on the summary line; messages after it keep Delete; Retry is only on the last user message.
- [ ] Deleting or retrying the prompt that triggered the summary keeps the summary.
- [ ] The summary survives a restart and keeps its place. The context ring drops after the summary and keeps counting from it (always an estimate, shown with a ~).
- [ ] Stop during the summary: the history is unchanged, the input is enabled, nothing is sent.
- [ ] Overflow with the setting on: a prompt over the window summarises and retries once; when it still does not fit, the error shows.
- [ ] Turning the setting off keeps existing summaries in effect and stops new ones.
- [ ] Check the server logs: the request after a summary carries the summary in the system prompt and the model does not reload.

### Tools popup

- [ ] Tools popup (Dispatch and chat): a Dispatch tool that is Off in the Dispatch settings is disabled with "Off in the Dispatch settings. Change it in Settings > Tools"; a Request approval one is on and reads "Asks before each use"; the read plus web warning shows when both are enabled; switches survive a restart.

### Web fetch

- [ ] Documentation page (e.g. https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html): headings, inline code and fenced code blocks with their language (```rust) look right. **[needs download/network]**
- [ ] News article with heavy navigation (menus, related links, a cookie banner): only the headline and the article text remain. **[needs download/network]**
- [ ] GitHub README (e.g. https://github.com/tauri-apps/tauri): headings, code blocks and tables look right; the title has no repeated ` · GitHub`; badges and linked pictures write nothing; no image address appears, and a standalone image with alt text of 8+ characters reads `(Image: alt)`. **[needs download/network]**
- [ ] Guardian index (e.g. https://www.theguardian.com/world): no bare `-` lines; each story reads `(Image: …)` then its headline, with no image address. **[needs download/network]**
- [ ] Wikipedia noise (e.g. https://en.wikipedia.org/wiki/Rust_(programming_language)): no `[edit]` links and no `[1]`-style citation markers in the answer. **[needs download/network]**
- [ ] JS-only page (an app shell that renders in the browser): little or no text, or only the title, or "(the page has no readable text)"; no error. **[needs download/network]**
- [ ] A table on a page (e.g. a comparison table on Wikipedia): a pipe table when it is regular and narrow; a line per row, cells joined with `; `, when it is irregular or wide. **[needs download/network]**
- [ ] A long page: the first answer ends with the `[truncated: showing characters ...; call again with start=N ...]` note, and calling again with `start=N` continues in the Markdown text. **[needs download/network]**
- [ ] Plain text, JSON or a Markdown file still comes back unchanged (no conversion). **[needs download/network]**

### Web search

- [ ] Chat with web_search On and the DuckDuckGo source on: a query gives numbered results under "Web (DuckDuckGo)", each with a title, a web address (not a duckduckgo.com redirect) and a snippet. **[needs download/network]**
- [ ] Request approval on web_search: the approval dialog reads "This tool will send your search to: duckduckgo.com." **[needs download/network]**
- [ ] The same query again straight after: the answer comes back at once from the cache, with no 5 s wait. **[needs download/network]**
- [ ] A query with no results (a long nonsense string): "Web (DuckDuckGo): no results." **[needs download/network]**
- [ ] After 20 requests in an hour (different queries), the next one reads "DuckDuckGo search limit reached for now (20 per hour). Try again later or use another source." at once, with no wait and no request. **[needs download/network]**
- [ ] Network off: the search reads the offline wording ("Could not reach the web: ...", the chat's offline text), not an empty list; with another source on, that one still answers. **[needs you]**
- [ ] Only if DuckDuckGo challenges the app (a captcha page or HTTP 429; cannot be forced): the tool reads "... is paused for 15 minutes" and calls in that time send nothing. **[needs download/network]**

## Dispatch

- [ ] Migration: an existing database opens, chats are unchanged, no Dispatch conversation shows in the chat list, recent conversations or the new-chat draft.
- [ ] Request approval in Dispatch: a conversation with a tool set to Request approval asks in the approval dialog (Allow once, Allow for this conversation, Deny); while it asks the conversation shows Needs you, the chat input stays locked, a queued conversation waits, and a hidden window gets "Dispatch needs your approval" with "<tool> in <title>"; Deny gives the model the denied result and the turn goes on; Stop cancels the question and ends the turn as Stopped; the tray reads "Dispatch: waiting for your approval on <title>". Close the app while it asks: the conversation shows Interrupted after reopening (the startup sweep in `commands/dispatch.rs` moves needs_you to interrupted). **[needs you]**
- [ ] Separate Dispatch tool settings: set one tool to On under Dispatch while Chat stays on Request approval; the chat still asks for it, the Dispatch conversation runs it without asking; set Dispatch back to Request approval or Off and the chat is unchanged. A tool never set under Dispatch is On there whatever its chat state (Off or Request approval too), and a new or MCP tool with no Dispatch state is On; an explicit Dispatch Off or Request approval wins over the default.
- [ ] A real multi-step request (list a folder, read files, summarise): the model calls tools, the transcript follows, the answer ends the turn as "Ready", a notification "Dispatch replied" shows when the window is hidden. **[needs you]**
- [ ] Restart while a turn runs: the conversation shows Interrupted; Continue works. A queued one left over does not start by itself; sending a message starts it.
- [ ] A long run with a real model (60+ tool rounds): it neither stops by itself nor loops without end; note how the model behaves (no step, time or repeat limit exists, Stop is the only guard).
- [ ] dispatch_notes: the model keeps notes, they show in the collapsible section and are used in the next request.
- [ ] Delete: a working or queued conversation cannot be deleted from the header. (The confirmation first, and the transcript gone after, were seen.)
- [ ] /dispatch/<unknown id> shows "This conversation no longer exists." with a way back; the breadcrumb shows the title.
- [ ] Offline: with the network off, a web_search call becomes an error row and the turn carries on. **[needs you]**
- [ ] Resume after an incomplete run: send a long message, close the app (Exit) while it works, reopen: one dialog "Dispatch was interrupted ... Continue it with the previously selected model?"; Continue starts the GenieX server, loads that model and carries on; "Not now" marks the conversation Stopped and the dialog does not return. With two interrupted conversations (also on different models) the dialog lists them and they run one after another, each on its own model. **[needs you]**
- [ ] Resume dialog with the model deleted or failing to load: an error toast names the model; the conversation stays Interrupted (queued ones show Failed with the reason).
- [ ] Dispatch runs every tool call of one reply (no cap of 4); the chat still caps at 4 per reply.
- [ ] An empty model reply (no text, no tool call) in Dispatch is sent again twice as the same step, with no new message; a reply on a retry carries on silently; after three empty replies the turn fails with "The model returned an empty reply 3 times in a row. Send a message to continue, or try another model." and a new message continues it.
- [ ] A Dispatch conversation logs its sampling once per turn: the console shows `[dispatch] sampling:` with the saved temperature, top P and repetition penalty, whatever model is loaded. A chat on the same model is unchanged: its sampling is the model's own, and no Dispatch line is logged.
- [ ] Per-step console line: every Dispatch request logs `[dispatch] step N: prompt_tokens=…, completion_tokens=…, ms=…`. On an engine with prompt caching (llama.cpp GGUF), prompt_tokens stays small as a long conversation grows (it counts only the new part), and it does not jump back to the whole history after a dispatch_notes update. On an engine without caching it grows with the history, which is expected.
- [ ] Large page in Dispatch: web_fetch on a long page is cut to the window sized from the context. With a 4k-context model the result stops at about 2,150 characters, with the truncated note; with a 32k one at about 17,200. Calling again with start=N continues it. A chat with the same page is cut at the backend default (8,000 characters). **[needs download/network]**
- [ ] Stall guard, errors: six failing calls in a row (for example read six missing file names) end the turn with "6 tool calls in a row failed. Last error: ..."; one successful call in between starts the count again.
- [ ] Continue on a finished conversation: Stop (or restart) after a full answer, then Continue (header or the resume dialog) ends it as Ready at once, with no error, no "Loading model" toast and no model request; a Stopped conversation whose last message is the user's still continues.
- [ ] The same search from Dispatch (a conversation that calls web_search). **[needs download/network]**

## Benchmarks

### Lists

- [ ] Benchmarks, Prompt Library and Test Runs: a row opens its item page; the row's "…" menu deletes an unused prompt or suite after a confirm. (The empty states, the confirm dialog and the refusal for a prompt used by a suite, "This prompt is used by LG suite. Remove it from those suites first.", were seen.)

### Run

- [ ] Benchmarks, Run: start a suite, go to Chat or Overview, come back: the progress and the end of the run are shown.
- [ ] Benchmarks, Run: Cancel keeps the finished steps; chat and model load are refused until the run ends; the Windows power plan and battery are recorded for the run. (A one-step suite on LFM2.5-1.2B on the NPU ran after the consent dialog, showed its step and appeared in Runs with compute NPU, TTFT 51 ms and 23.5 tokens/s.)

### Runs

- [ ] Runs table: 10 rows a page; sorting covers all pages; ticked runs stay ticked across pages; Compare and Export use the ticked runs; Compare charts use the selected runs; CSV and PNG exports open the save dialog and "open" works on the saved file.

### Prompt Library

- [ ] Benchmarks, Prompt Library: a file removed from a saved prompt leaves the disk when no other prompt or step uses it.

## Playground

### Landing

- [ ] Playground landing: each row's "N models installed" count appears once its catalogue is read; the OCR count needs the GenieX CLI, and a row with no count shows none. **[needs download/network]**
- [ ] Playground landing: with stable-diffusion.cpp missing, Text to image, Image to image and Image upscaling are disabled; the landing has one Audio row, and with sherpa-onnx missing it is disabled with its reason. Each row names the runtime and points to Settings > Runtimes; the Audio tool shows the not-installed notice. **[needs you]**

### Text to image

Limits are in `known-issues.md` ("Text to image redesign, tab reset and rail").

- [ ] Hover or Tab to the disabled Generate (no model or no prompt) shows the reason. The disabled state itself was seen.
- [ ] Generate SD 1.5 Q4 at 512 x 512, 20 steps, Run on Auto (header selector): the phases show in order (loading, encoding, sampling with a step count, decoding, saving). The image shows, and a `.png` named from the prompt, time and seed is in `Pictures\LocalGenie`. Reveal in Explorer selects it. **[needs download/network]**
- [ ] Same prompt and a fixed seed twice on CPU: the two images match. **[needs download/network]**
- [ ] Random seed: the seed used is shown with the result, and the same seed reproduces it. **[needs download/network]**
- [ ] Generate before the model is downloaded, or with the runtime removed: refused with a message. **[needs download/network]**
- [ ] Negative prompt is disabled for FLUX.2 klein and Z-Image Turbo; CFG is disabled for them too. **[needs download/network]**
- [ ] Cancel during sampling: the status is cancelled, the process is gone (Task Manager), and no PNG is written. **[needs download/network]**
- [ ] Close the window during a generation: the sd-cli process ends. **[needs download/network]**
- [ ] GPU (only if the build lists one): with CFG 1.0 the image is not blank; with CFG above 1 check for the white-image bug (known-issues). Expect it to be slower than the CPU. **[needs you]**

### Image to image

- [ ] The selector lists SD 1.5 Q4 (re-draw, strength slider) and FLUX.2 klein 4B Q4 (edit) for this tool; Z-Image Turbo is not listed. Generate stays disabled until an image is chosen. **[needs download/network]**
- [ ] SD 1.5 re-draw at 256 px, 10 steps, strength 0.6 on CPU: a picture is made (not blank; quality is rough). A strength outside 0.05..1.0 is refused. **[needs download/network]**
- [ ] FLUX.2 klein edit at 256 px, 4 steps: the result applies the instruction ("What to change"). **[needs download/network]**
- [ ] A result made in Text to image does not show in Image to image, and the reverse. **[needs download/network]**
- [ ] Cancel, leaving the tab and coming back, and closing the window behave as for text to image. **[needs download/network]**

### Audio: entry and selector

Limits are in `known-issues.md` ("Audio tool").

- [ ] Old links: `/playground/speech-to-text`, `/playground/text-to-speech` and `/playground/audio-to-audio` open Audio on Speech to text, Text to speech and Clean up and split.
- [ ] The header selector lists the active task's models, titled "Audio: <task>", with a CPU only row. The Audio card has no compute note. **[needs download/network]**

### Audio: models

- [ ] Speech to text lists Whisper tiny (English) and Moonshine base (English); Text to speech lists Kokoro v1.0 (int8). Download each (about 110-130 MB): progress, Ready, cancel and resume; delete frees the folder. **[needs download/network]**

### Audio: speech to text

- [ ] Speech to text: the phases show (loading, transcribing); Copy puts the transcript on the clipboard; silence gives "No speech was recognised." **[needs download/network]**
- [ ] Microphone: while recording the input shows no waveform; after Stop the clip shows with its waveform and transcribes. A copy is in the app cache `playground-audio` folder, and recordings older than a day are removed on the next save. **[needs you]**
- [ ] A WAV over 10 MB: the input preview shows an error; note whether the job still runs on it. **[needs download/network]**
- [ ] A long clip (several minutes): the waveform takes a while to draw, and the page stays usable meanwhile. **[needs download/network]**

### Audio: text to speech

- [ ] Voice and Speed sit on one row. Pick a voice and speed and generate: a `.wav` appears in `Music\LocalGenie`, the result shows a waveform player, and Show in folder selects the file. Text with accents or curly quotes still speaks (non-ASCII is converted). **[needs download/network]**
- [ ] Use as input on a speech result: the file becomes the Speech to text input and the task switches to Speech to text. **[needs download/network]**
- [ ] Voice cloning: in Text to speech pick Pocket TTS (voice cloning) and download it (98 MB). The voice and speed row is hidden and a Voice to copy input appears. Generate stays disabled until a clip is chosen; the output plays and sounds like the clip. Kokoro still shows its voices and speed. **[needs download/network]**

### Audio: clean up and split

- [ ] Both outputs show a player each, with its own Use as input. Show in folder works; the info icon next to the button explains the saved files. Cancel stops the process. **[needs download/network]**

### Audio: players

- [ ] Play, back and forward 10 s, dragging the playhead, arrow keys (5 s; Shift for 10 s), Home and End. The played part is in the brand colour, and the time reads `m:ss`. Starting one clip pauses the other. **[needs download/network]**

### Audio: jobs and leaving the tool

- [ ] Cancel a job: the status is cancelled and no process remains. Close the window during a job: the process ends. **[needs download/network]**
- [ ] Audio: leave the tool during a job and come back: the progress is still there. Voice, speed and the clean up or split choice are kept after leaving (task and model were seen kept). **[needs download/network]**

### OCR

Limits are in `known-issues.md` ("Runtime status of the Playground").

- [ ] Narrow window (900 px or less): the columns stack, the input first and the result under it.
- [ ] Markdown switch on: headings, lists and a table render; a wide table scrolls sideways inside the box, and its header is bold and shaded. Switch off: the plain text field returns. **[needs download/network]**
- [ ] Copy and Save as .txt write the raw text (the Markdown symbols are kept) even while the Markdown view is on. **[needs download/network]**
- [ ] A new job turns the Markdown switch back off. **[needs download/network]**
- [ ] The input preview dialog (opened by clicking the OCR preview; the title is the file name and Escape closes it, both seen): a long file name is clipped with an ellipsis, Close closes it, and Open location shows the file in Explorer.

### Model selector

Limits are in `known-issues.md` ("Playground selector and downloads").

- [ ] No preselection: with installed Playground models and no pick yet, no row reads Selected and the tool page shows "Pick a model in the selector above". Nothing runs until a model is picked. **[needs download/network]**
- [ ] Select an installed model: its row reads Selected and the page's hint goes away. Click Selected again: it clears and the hint returns. **[needs download/network]**
- [ ] Picking a second OCR model while the first runs does not start a second server; clearing the OCR model leaves the server running (the badge turning Running on the first pick was seen). **[needs download/network]**
- [ ] Recommended hides when every model of the listed tools is downloaded; the Installed section then lists them all. **[needs download/network]**
- [ ] Recommended Download: the row reads Downloading; the other Download buttons are disabled; the drawer shows the entry; when it finishes the model moves to Installed and reads Ready on the tool page. **[needs download/network]**
- [ ] The header selector's Recommended section lists the three models (SD 1.5 Q4, FLUX.2 klein 4B Q4, Z-Image Turbo Q4) with sizes and a Download button (see the selector items above). **[needs download/network]**
- [ ] A failed catalog read shows a compact Try again above the sections; the models that did load stay listed. **[needs you]**
- [ ] "Run on" rows: text to image and image to image list Auto, NPU, GPU and CPU for the devices this build lists (GPU shows the experimental hint); upscaling shows CPU only. A choice changes the next generation's device. (The Audio CPU-only row and the two OCR rows were seen.) **[needs download/network]**
- [ ] "Find more on Hugging Face" is disabled and marked Coming soon.
- [ ] Dropdown empty state, then "Get models" and "More models" open the right pages.

### Downloads

- [ ] A model download (image, then speech) shows a drawer entry with its file (file n of m), bytes, speed and time left once known; it also appears under the active downloads on Models > Local. **[needs download/network]**
- [ ] Cancel in the drawer: the entry reads "Paused" with Resume. Resume continues from the partial file (the byte count does not restart at zero) and finishes; the model shows Ready. **[needs download/network]**
- [ ] Offline start of a Playground download (image or speech): the entry shows the offline text and retries by itself (see "Downloads: automatic retry"); the "Model download failed" toast appears only when the automatic retries are used up; a speech or upscaling model names GitHub, an image or OCR model names Hugging Face. Hovering shows the raw error. Retry after reconnecting finishes the download. **[needs you]**
- [ ] Leave the Playground during a download and come back: the entry is still updating. **[needs download/network]**
- [ ] Download SD 1.5 Q4 (about 1.7 GB): per-file progress in the drawer, "Model downloaded" toast, the model is Installed in the selector. **[needs download/network]**
- [ ] FLUX.2 klein and Z-Image Turbo share the Qwen3-4B text encoder. Downloading the second one fetches only its own files. Deleting one keeps the encoder while the other is downloaded; deleting both removes it. Deleting shows the bytes freed. **[needs download/network]**
- [ ] Delete and Download are refused while the model is generating or downloading. **[needs download/network]**

### Tab reset

- [ ] Choose a picture in Image to image, go to Chat, then come back: the picture is gone; the model selection is kept.

## Settings

### Landing

- [ ] Settings landing: the Runtimes row shows "No runtime installed" when none is installed, or "A runtime update is available" when one has a newer release, with a warning icon. **[needs you]**

### App

- [ ] Settings > Compact long conversations: the threshold slider runs from 50 to 90, and Save persists after a restart. (Off by default, and the slider (default 70) only appearing with the switch on, were seen.)
- [ ] Settings: port save/probe persists.
- [ ] Dispatch sampling card: the saved values survive a restart. (The defaults 0.3, 0.90, 1.05 with the other fields empty, the "Dispatch sampling saved" toast, and Reset to defaults only filling the draft until Save were seen.)

### Runtimes: GenieX CLI

- [ ] Settings > Runtimes lists GenieX CLI first, with its logo, installed version or "Not installed", latest version and repo. The "…" menu has Release notes, Uninstall (disabled when not installed) and, when not installed, Check again. **[needs download/network]**
- [ ] Install GenieX (not installed): Install queues an entry in the Downloads drawer. Stages: Checking release, Downloading (with bytes), Verifying, Installing…, Done. No installer window appears (the setup runs silently). Toast "GenieX CLI installed"; the card shows the version; Models, Chat and Benchmarks unlock without a restart. **[needs download/network]**
- [ ] After success the setup `geniex-cli-setup-windows-arm64-v<version>.exe` is gone from the app data folder (`%APPDATA%\com.localgenie.app\`). After a failed or cancelled install it stays there. **[needs download/network]**
- [ ] Update: with an older GenieX installed, the card offers Update; the drawer runs it and the card shows the new version. **[needs download/network]**
- [ ] While an install or update of a runtime is queued or running, its card's "…" menu is disabled. **[needs download/network]**
- [ ] Cancel during Downloading: the entry shows cancelled; Resume downloads again. Cancel during Installing: the drawer stops waiting. If the setup was running, it finishes with no window (check Task Manager and the version afterwards). **[needs download/network]**
- [ ] Uninstall: "…" > Uninstall, then confirm. The confirm text names what stays locked. The card shows a spinner; no uninstaller window appears; the server started by the app stops; toast "GenieX CLI removed"; the card shows Not installed. **[needs you]**

### Runtimes: optional (stable-diffusion.cpp, sherpa-onnx)

- [ ] The section lists GenieX CLI, stable-diffusion.cpp and sherpa-onnx. Latest versions come from GitHub at startup, when the list changes and every 6 hours; offline, the cards show no latest version and the page still works. **[needs download/network]**
- [ ] Install: the stages show in order (checking, downloading with byte counts, verifying, extracting, done). The card shows the version. `%APPDATA%\com.localgenie.app\runtimes\sd-cpp\<tag>\sd-cli.exe` exists. **[needs download/network]**
- [ ] The archive installed is the ARM64 one (`windows-arm64` in the zip name), even when GitHub's latest release is an x64-only build. **[needs download/network]**
- [ ] Install sherpa-onnx in Settings > Runtimes: the `win-arm64 ... MinSizeRel.tar.bz2` archive installs, and `runtimes\sherpa-onnx\<tag>\bin\sherpa-onnx-offline.exe` and `sherpa-onnx-offline-tts.exe` exist. **[needs download/network]**
- [ ] After a restart the card still shows the installed version. **[needs download/network]**
- [ ] Update: when a newer ARM64 release exists the card offers Update; the older folder stays on disk. **[needs download/network]**
- [ ] Interrupt a download (disconnect), then retry: the `.part` file is reused and the install completes. A bad archive or a missing `sd-cli.exe` shows an error and leaves nothing in `runtimes\sd-cpp\`. **[needs you]**
- [ ] Uninstall (from the card's "…" menu, after the confirm): the card shows a spinner and a toast reports the result; the runtime folder and the card's version are gone. The Playground then shows the "not installed" notice. **[needs you]**

### Tools

- [ ] Settings > Tools: turning the DuckDuckGo source on survives a restart. (Off by default and its wording were seen.)

### About

- [ ] Links: the LocalGenie source link and each runtime's "Source code" link open in the system browser, not in the app window. **[needs download/network]**

### Storage

- [ ] Storage: "Open folder" opens each listed folder.

## Shell and cross-cutting

### Navigation and sidebar

- [ ] Sidebar rail: the toggle collapses to the icon rail and expands again; each rail icon has a tooltip with its name; Models shows its installed count on the icon; the usage chart is hidden in the rail; the state is kept after a restart.
- [ ] Breadcrumbs on a narrow window: the trail and the actions (chat's context ring and menus) wrap without overlapping.
- [ ] Lock tooltips: with GenieX removed, the sidebar's Models, Chat and Benchmarks are disabled, with the reason in a tooltip, in both the expanded and the rail view; the tooltip reads "Needs the GenieX CLI. Install it in Settings > Runtimes."; the Playground landing's OCR row is disabled with the same reason. **[needs you]**
- [ ] Route guard: with GenieX removed, a navigation to /models, /chat or /benchmarks (for example from the dev console) lands on Settings > Runtimes with the toast "This area is unavailable". **[needs you]**
- [ ] Start with GenieX missing: Models, Chat and Benchmarks show locked once the runtime list has been read (nothing is locked before that). **[needs you]**

### Sidebar usage chart

- [ ] Same job with no model loaded: the RAM section shows System only, with no "Model / context" row. **[needs download/network]**
- [ ] Image to image and upscaling: CPU line only. Speech: CPU line only. **[needs download/network]**
- [ ] Legend latest % matches the last point of its line. A target this device gives no counter for is not listed. **[needs download/network]**
- [ ] Leave the Playground tab during a job and come back: the lines are still plotted. **[needs download/network]**
- [ ] The card disappears after a job ends when no model is loaded, and stays while a model is loaded. **[needs download/network]**

### Downloads drawer and automatic retry

How: start a download online, then turn off the network adapter (as in "Offline mode") and turn it back on when the steps say so.

- [ ] A GGUF download with the adapter off mid-transfer: the card reads "Waiting for the connection to come back"; no error toast. **[needs you]**
- [ ] Adapter back on: one info toast "Connection is back: resuming N downloads"; the download continues from its `.part` file without a click; no start toast per attempt. **[needs you]**
- [ ] Adapter off and the connection still failing while online: the card counts down "Retrying in N s (attempt k of 3)" at about 5, 15 and 45 s; after the third, "Automatic retries used up" shows with the friendly error, and one error toast appears at the end, not one per attempt. **[needs you]**
- [ ] An HTTP 404 or 403 download failure: no countdown and no retry; one error toast; the card shows the friendly text (not the offline text). **[needs download/network]**
- [ ] Retry or Resume by hand after "used up": the retry budget starts again. **[needs you]**
- [ ] Playground image or speech model with the adapter off: the same wait, reconnect and countdown; the drawer entry shows no per-attempt start toast. **[needs you]**

### Offline mode

How: start the app online, then turn off the network adapter (Settings > Network & internet, or Device Manager > Disable device) and check each item. For the automatic retry, turn the adapter back on while a retry block is showing and do not click Try again.

- [ ] Models > Hugging Face, first open offline: skeleton cards while loading, then the full retry block ("You appear to be offline..." with Try again). No "No models match" text. **[needs you]**
- [ ] Reconnect with that block on screen: the list loads by itself, without a click. **[needs you]**
- [ ] Load more offline: the loaded list stays, a compact retry sits under it; after reconnecting, Try again loads the next page. **[needs you]**
- [ ] Filter panel offline: its tag lists show skeleton lines, then a retry; after reconnecting the lists load. **[needs you]**
- [ ] Local page, Hugging Face search offline: skeleton cards, then a compact retry under the installed models; the installed models still show and open. **[needs you]**
- [ ] Hugging Face detail offline: page skeleton, then the retry block; reconnecting loads the page. With the record loaded and the network then dropped: the file list and the README each show their own retry. "No model card available" appears only for a model with no README (404), never for a failed load. **[needs you]**
- [ ] Offline, with the adapter off: the Model Card README shows a skeleton while it loads, a Try again block on failure, and the images stay hidden when they fail. **[needs you]**
- [ ] Installed model detail offline: no skeleton, no retry and no Hugging Face wording; Load & Chat and Remove still work. **[needs you]**
- [ ] Chat with an installed model, offline: replies still stream (the local server only). **[needs you]**
- [ ] Models > Qualcomm AI Hub offline: skeleton cards, then the retry block; reconnecting loads the catalog. **[needs you]**
- [ ] AI Hub model detail offline: the page retry block; reconnecting loads it. With the page loaded and the network then dropped, the README shows its own retry; the assets card's retry reloads the detail. **[needs you]**
- [ ] AI Hub download while offline: the drawer entry shows "You appear to be offline..." (or "Could not reach the Qualcomm AI Hub"); hovering the text shows the raw error; Resume after reconnecting imports the zip. **[needs you]**
- [ ] Hugging Face GGUF download while offline: the drawer entry fails with the same kind of text; a projector failure toast names Hugging Face. **[needs you]**
- [ ] Settings > Runtimes offline: each card shows a placeholder where "Latest" appears while it checks, then "Could not check for updates." with Try again. Installed versions still show; Uninstall of an installed runtime is still enabled. **[needs you]**
- [ ] Slow link, not an offline test: a Hub request that takes longer than 30 s shows "took too long to answer. Try again." (needs a throttled connection; not tried). **[needs you]**

### Background running, tray and exit prompts

- [ ] Tray: the tooltip shows "Dispatch: working on <title>"; Exit asks "A Dispatch conversation is still working. Exit and stop it?". **[needs you]**

### Runtime update notifications

Limits are in `known-issues.md`.

- [ ] Real update: with an older runtime installed and a newer release on GitHub, the app shows one notification ("<name> <version> is available", body "Installed <version>. Open Settings > Runtimes to update.") at start, or within 6 hours while the app stays open. **[needs you]**
- [ ] Two runtimes with updates at once: one notification titled "2 runtime updates are available" that names both. **[needs you]**
- [ ] Restart the app with the same update still pending: no second notification. **[needs you]**
- [ ] Install the update, restart: no notification for the installed version; a later release notifies once. **[needs you]**
- [ ] Switch off ("Notify me when a runtime update is available", Settings > Application & Runtime) with an update pending, then restart: nothing is sent. Switch on: the pending update is sent at once, without a restart. **[needs you]**
- [ ] The switch keeps its state after a restart.
- [ ] Clicking the notification does not open the app (known limit); the Settings > Runtimes card still shows the update. **[needs you]**
- [ ] Installed build: the toast header reads "LocalGenie". Under `tauri dev` it reads "Windows PowerShell". If an installed build shows the raw identifier `com.localgenie.app` or another name, see the open item in `known-issues.md`. **[needs you]**
- [ ] Offline start: no notification and no error toast; Settings > Runtimes shows the retry text. At app start offline no update toast appears, and the failure shows only in Settings > Runtimes. **[needs you]**

### Installer, uninstall and upgrade

Use a debug installer, except the release item.

- [ ] Uninstaller checkbox for the application data: its label reads correctly; ticked and unticked behave as described. **[needs you]**
- [ ] Silent uninstall (`/S`) of LocalGenie runs without a window. **[needs you]**
- [ ] Update-mode install (`/UPDATE`) keeps the data and skips the cleanup. **[needs you]**
- [ ] GenieX setup sweep: after a real GenieX update the `geniex-cli-setup-*.exe` is gone; a startup sweep keeps a `.part` file. **[needs you]**
- [ ] Upgrade: an existing `geniex.db` is renamed to `localGenie.db` at the first start on real data. **[needs you]**
- [ ] Release (non-debug) installer: installs per user and shows styles. **[needs you]**

### App updater and release

- [ ] Going online after a failed check retries the check without a click. **[needs you]**
- [ ] Install with work running (a chat reply, a download, a Playground or OCR job, a benchmark): the confirm lists each item; Cancel installs nothing. **[needs you]**
- [ ] Install with nothing running: no confirm; progress shows; the app restarts into the new version. **[needs you]**
- [ ] A newer published version sends one desktop notice for that version; a restart with the same version sends none. **[needs you]**
- [ ] Runtime update switch off with an app update known: no app notice; switch on: the pending notice is sent without a restart. **[needs you]**
- [ ] The Settings sidebar item shows a dot while an update is known; Settings > About shows the version line and the update note. **[needs you]**
- [ ] The private key and its password are backed up outside GitHub. **[needs you]**
- [ ] A tag that does not match the version files fails at the first step (not run). **[needs you]**
- [ ] Non-debug installer: its update check reads the published latest release. (The installed 0.1.1 app reads the real feed over TLS, 2026-11-11; which installer it is was not recorded, so this stays open.) **[needs you]**
- [ ] Publish a draft: an installed older build offers it, installs, and restarts into the new version. **[needs you]**

### General build sanity

- [ ] `npm run check` passes (TypeScript, no errors). **[needs you]**
- [ ] `npm run lint` passes (Biome — 0 errors, 0 warnings as of 2026-09-18). **[needs you]**
- [ ] `cargo check` passes in `src-tauri/` (no warnings introduced). **[needs you]**
- [ ] `npm run build` produces MSI + NSIS bundles under `src-tauri/target/release/bundle/`. **[needs you]**
- [ ] App launches from the built bundle and the server connects on the configured port (default `18181`). **[needs you]**

### Stitch UI regression

- [ ] All views render and switch via the sidebar: Overview, Models, Chat, Benchmarks, Settings — without losing active session or server status.
- [ ] Responsive: model grid 3→2→1 columns; settings rows stack. (The sidebar collapses only from its toggle; see the navigation section.)
- [ ] Keyboard: Escape closes model-remove dialog; nav items are real buttons (focusable); sliders are labelled via `aria-labelledby`.

# Manual checklist (after build / deployment)

Run through these checks manually after building or deploying the app. Automated checks cannot fully verify installer behavior, filesystem permissions, or OS-level interactions.

## GGUF projector matching and the drawer warning (2026-11-12 working tree; ticked = the user tested)
- [x] A download of a UD repo (for example `unsloth/Qwen3.5-4B-GGUF`) gets its projector: the projector is downloaded and imported (tested by the user, 2026-11-12).
- [ ] After that import the model's settings scan confirms vision (the chat Image attach is then enabled).
- [ ] A repo with only BF16 and Q8_0 projectors downloads the BF16 file (check the Downloads folder).
- [ ] A projector that fails with a 404 (not a network error): the card shows "Projector not downloaded: <name>. Vision will not work for this model." in the warning colour, in the active state and after the download ends (history state); the model still imports and the toast appears. Not run.
- [ ] The warning line wraps without overlapping the buttons in a narrow window. Not run.
- [ ] A model imported from an affected repo before the fix has no projector (expected); a re-download gives it one.

## Native tools for chat models (2026-11-11 working tree, phases 1-3; the user tested the approval dialog and the Tools list; the items are not ticked one by one)
- [ ] A tool call with a real tool-capable model: turn one tool On in Settings > Tools, ask for something it can answer, and check the call line appears before the answer.
- [ ] Approval dialog with Request approval: Approve once, Allow for this chat (the next call runs without asking) and Deny (the model gets the denied result and carries on).
- [ ] Stop while an approval prompt is open: the prompt closes, the call is recorded as cancelled and no request follows.
- [ ] Reload a chat whose reply only made tool calls (no text): the chat and its tool lines come back.
- [ ] Offline `web_fetch` shows Failed on its line, and the reply goes on.
- [ ] Settings > Tools: the states, the allowed folders and the search sources survive a restart; the folder picker adds a folder.
- [ ] Plain chat with no tools on, after the change to how a send waits for the end of a reply: the reply is saved and the next send works.
- [x] `read_image` with a model that has vision confirmed (tested by the user, 2026-11-12).
- [ ] `read_image` with a model that does not have vision (the result says so); after a restart (the saved picture still opens); after deleting the picture file (a failed result, no crash).
- [ ] `list_directory` without a path lists the allowed folders.
- [ ] Real `web_fetch` and `web_search` against live sites, one check for each enabled source.

## Native tools: per-chat tools chip and image preview (2026-11-12 working tree, phase 5; ticked = the user tested)
- [x] `read_image` row: expanding the line shows the thumbnail with the file name; clicking it opens the picture (tested by the user, 2026-11-12).
- [ ] A deleted picture file on an expanded `read_image` row shows "File no longer on this device"; re-expanding after the file returns shows it again (no cache).
- [ ] The "Tools N" chip sits under the field when a chat is open and some tool is On or Request approval; it is hidden with no chat open and when every tool is Off.
- [ ] The popover lists only the tools that are not Off, each with its global state text; placement and width are right in a narrow window.
- [ ] "Use in this chat" off for a tool: the count drops, and a send in that chat does not offer the tool; another chat still has it.
- [ ] A model that calls a tool switched off for the chat gets "This tool is turned off." on that line.
- [ ] "Tool settings" opens Settings > Tools.
- [ ] Switch a tool off in a chat, delete the chat, open a new chat: the new chat's switches are all on.
- [ ] After a restart the per-chat switches are on again (expected: memory only).

## Playground: Image upscaling redesign (2026-11-05; not run, none ticked)

Limits are in `known-issues.md` ("Image upscaling and Image to image redesign").

Empty and first step:
- [ ] Before a result the card header shows "Scale 4x" with its info icon and no Compare button. The body shows the dashed "Choose a picture to upscale it here." frame.
- [ ] The controls row: "Choose image" with an info icon (hover: the PNG or JPG hint) on the left; Upscale on the right.
- [ ] With no model or no picture, Upscale is disabled and still focusable: hover or Tab to it shows the reason.

Input and job:
- [ ] Choosing a picture shows it large across the card width, with its file name under it. A tall picture is not capped in height.
- [ ] A PNG or JPG over the limits shows the size warning above the controls.
- [ ] Upscale: the input preview is replaced by the centred progress block (phase, bar, elapsed) with Cancel under it. After Cancel the input preview returns with the cancelled message under it.

Result:
- [ ] After a success the upscaled picture fills the stage. The controls row shows a timer icon with the duration (hover: "Upscaled in ...") and a folder icon (hover: the saved path) on the left, and Show in folder and Clear on the right.
- [ ] Click the upscaled picture: it opens larger; Open location works.
- [ ] Compare is off until both pictures have loaded, then enabled. Compare shows Before and After (4x) labels. Dragging anywhere in the box moves the divider; Tab to the handle, then the arrows move it 2 percent and Shift+arrows 10 percent; Home and End go to the edges.
- [ ] Turning Compare on does not change the box's shape (no jump). Compare off returns to the single picture.
- [ ] Clear returns to the first step with the picker and Upscale. Choosing the same file again shows its saved result again (expected from code).
- [ ] Leave the Playground tab and come back during and after a job: the stage matches the job or the saved result.
- [ ] A failed or cancelled job shows its message in the stage with the input preview above it.

Shared pieces:
- [ ] Help labels (compute and generate fields) show their text on hover and focus.
- [ ] Light and dark themes: the Compare labels and handle are readable. Narrow window: the controls row wraps without overlap.

## Playground: Image to image redesign (2026-11-05; not run, none ticked)

Limits are in `known-issues.md` ("Image upscaling and Image to image redesign").

Empty and input:
- [ ] One card, "Edit image": the header has the "W x H" size button and no Compare button. The body shows the dashed "Choose a picture to edit it here." frame, with Choose image and its info icon (hover: the PNG or JPG hint) on the left and Generate with its info icon (hover: the time note) on the right.
- [ ] With no model or no picture, Generate is disabled and still focusable: hover or Tab to it shows the reason.
- [ ] The size button opens the size popover; the button text follows the width and height.
- [ ] Choosing a picture shows it large across the card with its file name under it. A tall picture is not capped in height. Choose image and Generate stay on the controls row.

Settings:
- [ ] Advanced settings is collapsed at first. Opened: the negative prompt, then one row with Steps, CFG scale and Seed (the Random seed switch beside the seed box). For SD 1.5 (re-draw) Strength comes last in the row. The boxes line up; the row wraps in a narrow window.
- [ ] FLUX.2 klein (no negative prompt, fixed CFG): the negative prompt and CFG boxes are locked, and hovering them shows the reason.
- [ ] Advanced settings closes again after a job (expected from code).

Job:
- [ ] While a job runs, the picture is replaced by the progress block with Cancel; the settings and the controls row are hidden.
- [ ] After Cancel or a failure, the picture, settings and controls return, with the message in the stage above them.
- [ ] The size button can be changed during a job; the job keeps the size it started with (expected from code).

Result:
- [ ] After a success, the settings and the Generate row are replaced by the result row: timer and duration, a device icon (hover: "Computed on ..."), the seed with Use seed, and a folder icon (hover: the saved path) on the left; Show in folder, Use this image as input and Clear on the right.
- [ ] Click the result: it opens larger; Open location works.
- [ ] Compare is off until both pictures have loaded, then enabled. Input and Result labels show; the divider moves by drag and by the keys; Compare off returns to the single picture; the box does not jump.
- [ ] Use seed sets the seed and turns Random seed off.
- [ ] Use this image as input: the result becomes the input with its size; the settings return; the form is kept.
- [ ] Clear: returns to the picker, with the form and settings kept. Choosing the same file again shows its saved result again (expected from code).
- [ ] Leave the tab during and after a job: the stage matches the job or the saved result.

Shared with Text to image and Image upscaling:
- [ ] Text to image: Steps and CFG scale share one row, with Seed and its switch after them; locked CFG and negative prompt show their reasons on hover; no helper line sits under the boxes.
- [ ] Image upscaling: the empty frame shows; Compare appears in the header only after a result; Show in folder and Clear work.
- [ ] Light and dark themes: the Compare labels and handle are readable.

## Playground: Text to image redesign, tab reset and the rail (2026-11-05; not run, none ticked)

Limits are in `known-issues.md` ("Text to image redesign, tab reset and rail").

Text to image:
- [ ] One card, "Generate": the header has the "W x H" size button; a click opens the size popover, with the step of 8 and the native-size hint.
- [ ] Before a job the picture area shows the dashed "The generated picture appears here." frame. Below it: the Prompt, the collapsed "Advanced settings", and the controls row with Generate and its info icon (hover: the time note) on the right.
- [ ] With no model or no prompt, Generate is disabled and still focusable: hover or Tab to it shows the reason.
- [ ] Advanced settings opened: the negative prompt, then Steps, CFG scale and Seed in one row (no Strength). A locked field shows its reason on hover.
- [ ] While a job runs, the picture area shows the progress with Cancel; the prompt, settings and controls are hidden. Advanced settings is closed after the job (expected from code).
- [ ] After a success: the picture shows large and opens larger on click; there is no Compare. The controls row shows the time, device icon, seed with Use seed and folder icon on the left; Show in folder and Use this image as input on the right; no Clear. The prompt and settings are visible below.
- [ ] Use this image as input: Image to image opens with the picture as its input, and its settings are kept.
- [ ] After Cancel or a failure, the message shows in the picture area and the previous picture is gone (expected from code).
- [ ] Changing the size during a job does not change the running job (expected from code).

Tab reset:
- [ ] Generate a text picture, go to Image to image, then back to Text to image: the earlier text picture is gone; the prompt and settings are kept.
- [ ] Choose a picture in Image to image, go to Chat, then come back: the picture is gone; the model selection is kept.
- [ ] Use this image as input from Text to image: the picture stays in Image to image after the switch.
- [ ] Audio: a recording chosen for Speech to text, then Overview, back to Audio: the input and the transcript are gone; the task and the model are kept.
- [ ] OCR: a picture and its text are gone after switching to another Playground tool; the mode and compute choices are kept.
- [ ] Leave a tool during a job and come back: the job's progress or result and its picture are still there.
- [ ] Audio: a file chosen for Speech to text is still there after switching to Text to speech and back (each task keeps its own input).

Sidebar rail:
- [ ] Collapsed rail: the icons sit in one column, centred, level with the brand and toggle buttons.
- [ ] Collapse and expand several times, and after a rail click on another page: the selection indicator sits on the selected page each time.

## Playground selector, Playground downloads and installed Playground models (31a9e7c, 2026-11-05; not run, none ticked)

Limits are in `known-issues.md` ("Playground selector and downloads").

Selector (header, on the Playground pages):
- [ ] On a Playground page the header shows the Playground selector (beaker icon, "Switch Playground model"); on Overview, Models, Chat and Benchmarks the chat selector shows.
- [ ] No preselection: with installed Playground models and no pick yet, no row reads Selected and the tool page shows "Pick a model in the selector above". Nothing runs until a model is picked.
- [ ] Select an installed model: its row reads Selected and the page's hint goes away. Click Selected again: it clears and the hint returns.
- [ ] Select an OCR model: the header's server badge turns Running. Picking a second OCR model while it runs does not start a second server; clearing the OCR model leaves the server running.
- [ ] Recommended hides when every model of the listed tools is downloaded; the Installed section then lists them all.
- [ ] Recommended Download: the row reads Downloading; the other Download buttons are disabled; the drawer shows the entry; when it finishes the model moves to Installed and reads Ready on the tool page.
- [ ] A failed catalog read shows a compact Try again above the sections; the models that did load stay listed.
- [ ] "Run on" rows: text to image and image to image list Auto, NPU, GPU and CPU for the devices this build lists (GPU shows the experimental hint); upscaling and the Audio tool show CPU only; OCR shows two rows (language model: Auto, NPU, GPU, CPU; vision encoder: NPU or CPU). A choice changes the next generation's device.
- [ ] "Find more on Hugging Face" is disabled and marked Coming soon.

Playground downloads (drawer):
- [ ] A model download (image, then speech) shows a drawer entry with its file (file n of m), bytes, speed and time left once known; it also appears under the active downloads on Models > Local.
- [ ] Cancel in the drawer: the entry reads "Paused" with Resume. Resume continues from the partial file (the byte count does not restart at zero) and finishes; the model shows Ready.
- [ ] Offline start of a Playground download (image or speech): the entry shows the offline text and retries by itself (see "Downloads: automatic retry"); the "Model download failed" toast appears only when the automatic retries are used up; a speech or upscaling model names GitHub, an image or OCR model names Hugging Face. Hovering shows the raw error. Retry after reconnecting finishes the download.
- [ ] Leave the Playground during a download and come back: the entry is still updating.
- [ ] Delete of a model while it downloads is refused.

Installed models (Models > Local):
- [ ] The Playground chip is last in the chip row and shows only while a Playground model is installed. It lists the models grouped by tool (Image generation, Image to image, Upscaling, Speech to text, Text to speech, Clean up and split, OCR).
- [ ] The name filter applies to the Playground list; the Search button and Enter do not search Hugging Face there.
- [ ] Delete from that list: the dialog shows the size; the model leaves the list and the tool's selector; a file shared with another downloaded model (the Qwen3-4B encoder) is kept while the other model is installed.
- [ ] An OCR model listed here also appears under the GenieX models list after the import.

## Playground: OCR page layout and result view (c84c413, 2026-11-05; not run, none ticked)

Limits are in `known-issues.md` ("Runtime status of the Playground").

Layout:
- [ ] Wide window (more than 900 px): the input card is on the left and the progress or result column on the right; both reach the same bottom edge.
- [ ] Before any job: the right column shows "Recognised text" with "The recognised text appears here."
- [ ] Narrow window (900 px or less): the columns stack, the input first and the result under it.
- [ ] After a read: the result card's Copy and Save as .txt sit right-aligned in its bottom row; long text scrolls inside the box instead of growing the page.

Running and result:
- [ ] A running job shows a centred spinner with "Elapsed" and the time under it, and Cancel; there is no progress bar and no time note.
- [ ] The Generate button has no note line under it on the OCR tab.
- [ ] Markdown switch on: headings, lists and a table render; a wide table scrolls sideways inside the box, and its header is bold and shaded. Switch off: the plain text field returns.
- [ ] Copy and Save as .txt write the raw text (the Markdown symbols are kept) even while the Markdown view is on.
- [ ] A new job turns the Markdown switch back off.

Input picture and chat preview:
- [ ] The input preview is larger; clicking it opens the picture in a dialog with the file name in the title (a long name is clipped with an ellipsis). Close and Escape close it; Open location shows the file in Explorer.
- [ ] A chat image attachment opens in the same dialog, with Open location. Audio and text attachments open as before.
- [ ] On every Playground tool with no model picked, an info bar reads "Pick a model in the selector above" at the top of the page.

## Runtime update notifications (f1e5543, 2026-11-04)

The user saw a test notification in the app on 2026-11-04 (the test button is removed). The items below were not run; none is ticked. Limits are in `known-issues.md`.

- [ ] Real update: with an older runtime installed and a newer release on GitHub, the app shows one notification ("<name> <version> is available", body "Installed <version>. Open Settings > Runtimes to update.") at start, or within 6 hours while the app stays open.
- [ ] Two runtimes with updates at once: one notification titled "2 runtime updates are available" that names both.
- [ ] Restart the app with the same update still pending: no second notification.
- [ ] Install the update, restart: no notification for the installed version; a later release notifies once.
- [ ] Switch off ("Notify me when a runtime update is available", Settings > Application & Runtime) with an update pending, then restart: nothing is sent. Switch on: the pending update is sent at once, without a restart.
- [ ] The switch keeps its state after a restart.
- [ ] Clicking the notification does not open the app (known limit); the Settings > Runtimes card still shows the update.
- [ ] Installed build: the toast header reads "LocalGenie". Under `tauri dev` it reads "Windows PowerShell". If an installed build shows the raw identifier `com.localgenie.app` or another name, see the open item in `known-issues.md`.
- [ ] Offline start: no notification and no error toast; Settings > Runtimes shows the retry text.

## Offline mode (27e98d1, 2026-11-04; not run offline in the app, none ticked)

How: start the app online, then turn off the network adapter (Settings > Network & internet, or Device Manager > Disable device) and check each item. For the automatic retry, turn the adapter back on while a retry block is showing and do not click Try again.

- [ ] Models > Hugging Face, first open offline: skeleton cards while loading, then the full retry block ("You appear to be offline..." with Try again). No "No models match" text.
- [ ] Reconnect with that block on screen: the list loads by itself, without a click.
- [ ] Load more offline: the loaded list stays, a compact retry sits under it; after reconnecting, Try again loads the next page.
- [ ] Filter panel offline: its tag lists show skeleton lines, then a retry; after reconnecting the lists load.
- [ ] Local page, Hugging Face search offline: skeleton cards, then a compact retry under the installed models; the installed models still show and open.
- [ ] Local page, Hugging Face search online: a search returns GGUF results (the search no longer comes back empty; this is the fixed bug, not run).
- [ ] Hugging Face detail offline: page skeleton, then the retry block; reconnecting loads the page. With the record loaded and the network then dropped: the file list and the README each show their own retry. "No model card available" appears only for a model with no README (404), never for a failed load.
- [ ] Installed model detail offline: no skeleton, no retry and no Hugging Face wording; Load & Chat and Remove still work.
- [ ] Chat with an installed model, offline: replies still stream (the local server only).
- [ ] Models > Qualcomm AI Hub offline: skeleton cards, then the retry block; reconnecting loads the catalog.
- [ ] AI Hub model detail offline: the page retry block; reconnecting loads it. With the page loaded and the network then dropped, the README shows its own retry; the assets card's retry reloads the detail.
- [ ] AI Hub download while offline: the drawer entry shows "You appear to be offline..." (or "Could not reach the Qualcomm AI Hub"); hovering the text shows the raw error; Resume after reconnecting imports the zip.
- [ ] Hugging Face GGUF download while offline: the drawer entry fails with the same kind of text; a projector failure toast names Hugging Face.
- [ ] Playground model download while offline (an image model, then a speech model): the card shows the friendly text and waits for the connection; no toast until the automatic retries are used up (then "Model download failed"); a speech model names GitHub.
- [ ] Settings > Runtimes offline: each card shows a placeholder where "Latest" appears while it checks, then "Could not check for updates." with Try again. Installed versions still show; Uninstall of an installed runtime is still enabled.
- [ ] App start offline: no update toast appears; the failure shows only in Settings > Runtimes.
- [ ] Hugging Face page link on a model detail opens in the system browser (through `openExternal`), not in the app window.
- [ ] Slow link, not an offline test: a Hub request that takes longer than 30 s shows "took too long to answer. Try again." (needs a throttled connection; not tried).

## Downloads: automatic retry, Models count and the Clean up and split label (2026-11-06; not run, Resume, projector retry and badge ticked)

How: start a download online, then turn off the network adapter (as in "Offline mode") and turn it back on when the steps say so.

- [ ] A GGUF download with the adapter off mid-transfer: the card reads "Waiting for the connection to come back"; no error toast.
- [ ] Adapter back on: one info toast "Connection is back: resuming N downloads"; the download continues from its `.part` file without a click; no start toast per attempt.
- [ ] Adapter off and the connection still failing while online: the card counts down "Retrying in N s (attempt k of 3)" at about 5, 15 and 45 s; after the third, "Automatic retries used up" shows with the friendly error, and one error toast appears at the end, not one per attempt.
- [ ] An HTTP 404 or 403 download failure: no countdown and no retry; one error toast; the card shows the friendly text (not the offline text).
- [ ] Retry or Resume by hand after "used up": the retry budget starts again.
- [ ] Playground image or speech model with the adapter off: the same wait, reconnect and countdown; the drawer entry shows no per-attempt start toast.
- [x] Resume from `.part` (HTTP Range) after a cancel or failure: tested by the user in the app, 2026-11-06.
- [x] GGUF projector (sidecar) download with the adapter off: the entry retries by itself and resumes from its `.part`; the network failure shows no "Projector not downloaded" toast (tested by the user in the app, 2026-11-06).
- [x] While the entry waits for the connection or counts down, the badge reads "Retrying soon" (clock icon), not "Error" (tested by the user in the app, 2026-11-06).
- [ ] Models landing (`/models`): the installed count is the GenieX models plus the Playground models except OCR (OCR models are already GenieX models, so they are counted once).
- [ ] The Playground chip on the Local models page labels the audio group "Clean up and split" (not "Audio to audio").

## Playground: more models, the Playground models page and model cards (2026-11-07 working tree; ticked = approved by the user, "all good")

Not run: download each model and run it once.
- [ ] SD-Turbo (Q4)
- [ ] SDXL base (Q4)
- [ ] SDXL-Turbo (Q8)
- [ ] FLUX.1 schnell
- [ ] Real-ESRGAN x4plus
- [ ] 4xNomosWebPhoto
- [ ] 4xNomos8kSC
- [ ] Qwen3-VL-2B (OCR)
- [ ] dots.ocr (OCR)
- [ ] DeepSeek-OCR (OCR)
- [ ] Whisper base.en, base, small.en and turbo
- [ ] Moonshine tiny
- [ ] Piper voices (Lessac, GLaDOS, LibriTTS-R)
- [ ] Matcha LJSpeech
- [ ] Kitten nano

Approved by the user (run in the app):
- [x] FLUX.2 klein 9B
- [x] Z-Image base
- [x] SenseVoice
- [x] Parakeet v3
- [x] Supertonic 3 (English)
- [x] DPDFNet (clean up)
- [x] GLM-OCR

Pages and cards (approved):
- [x] Models > Playground models page and its per-model detail pages (facts, capabilities, specifications, files)
- [x] Header Playground dropdown lists installed models only
- [x] Model card: Hugging Face README as Model Card, and its images

Not run:
- [ ] Offline, with the adapter off: the Model Card README shows a skeleton while it loads, a Try again block on failure, and the images stay hidden when they fail.
- [ ] Dropdown empty state, then "Get models" and "More models" open the right pages.

## Settings > About (committed 1ab5267, 2026-11-04)

The user looked at the page in the app on 2026-11-04 and said it looked good. The items below were not run; none is ticked.

- [ ] Links: the LocalGenie source link and each runtime's "Source code" link open in the system browser, not in the app window.
- [ ] Runtimes list: opening About first (before the runtime list is loaded) fills in the runtime lines; a runtime not installed reads "Not installed".

## Navigation redesign (committed 24528c2, 2026-11-04/05)

The user looked at the landings, the breadcrumbs, Recent conversations, the item rows and the chat header actions in the app on 2026-11-04/05 and approved them. The items below were not run; none is ticked.

- [ ] Sidebar rail: the toggle collapses to the icon rail and expands again; each rail icon has a tooltip with its name; Models shows its installed count on the icon; the usage chart is hidden in the rail; the state is kept after a restart.
- [ ] Locked sidebar items (no GenieX CLI) are disabled, with the reason in a tooltip, in both the expanded and the rail view.
- [ ] Benchmarks, Prompt Library and Test Runs: a row opens its item page; the row's "…" menu deletes after a confirm; a prompt used by a suite is refused with the reason; an empty list shows its empty state.
- [ ] Benchmarks, Run: start a suite, go to Chat or Overview, come back: the progress and the end of the run are shown.
- [ ] Playground landing: each row's "N models installed" count appears once its catalogue is read; the OCR count needs the GenieX CLI, and a row with no count shows none.
- [ ] Runs table: 10 rows a page; sorting covers all pages; ticked runs stay ticked across pages; Compare and Export use the ticked runs.
- [ ] Breadcrumbs on a narrow window: the trail and the actions (chat's context ring and menus) wrap without overlapping.

## Installer, uninstall and Storage (phase 1, 2026-11-07; ticked = the user tested on own machine with a debug installer)
- [x] The installer runs per user, with no admin prompt.
- [x] The app runs from the installed copy with styles applied (nonce fix).
- [x] Settings > Application & Runtime > Storage shows its rows (database 1.1 MB, Playground models, GenieX models); rows for missing folders are hidden.
- [x] The database file is named `localGenie.db`.
- [x] Uninstall cleanup without `--delete-data`: GenieX CLI uninstalled, runtimes removed, 0 failed steps.
- [x] Uninstall cleanup with `--delete-data`: database, Playground models, GenieX model cache and legacy images removed, 0 failed steps. (The user reports three runs; only these two variants were recorded.)
- [ ] Uninstaller checkbox for the application data: its label reads correctly; ticked and unticked behave as described.
- [ ] Silent uninstall (`/S`) of LocalGenie runs without a window.
- [ ] Update-mode install (`/UPDATE`) keeps the data and skips the cleanup.
- [ ] GenieX setup sweep: after a real GenieX update the `geniex-cli-setup-*.exe` is gone; a startup sweep keeps a `.part` file.
- [ ] Storage: "Open folder" opens each listed folder.
- [ ] Upgrade: an existing `geniex.db` is renamed to `localGenie.db` at the first start on real data.
- [ ] Release (non-debug) installer: installs per user and shows styles.

## App updater and release (2026-11-10 to 11; ticked = the user tested; the rest not run)
- [x] A debug build starts with the updater (no startup error).
- [x] Settings > Application & Runtime shows the App updates card with the running version (0.1.0).
- [x] A failed check shows the Try again block.
- [x] Update from the local feed (`scripts/updater-test/`): 0.1.0 downloads 0.1.1, installs and restarts as 0.1.1.
- [ ] Going online after a failed check retries the check without a click.
- [ ] Install with work running (a chat reply, a download, a Playground or OCR job, a benchmark): the confirm lists each item; Cancel installs nothing.
- [ ] Install with nothing running: no confirm; progress shows; the app restarts into the new version.
- [ ] A newer published version sends one desktop notice for that version; a restart with the same version sends none.
- [ ] Runtime update switch off with an app update known: no app notice; switch on: the pending notice is sent without a restart.
- [ ] The Settings sidebar item shows a dot while an update is known; Settings > About shows the version line and the update note.
- [x] CI: the job runs on `windows-11-arm` and the checks pass (2026-11-10/11).
- [x] Repository secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are set (2026-11-11).
- [ ] The private key and its password are backed up outside GitHub.
- [x] Release workflow on tag `v0.1.1`: the draft had the installer, its `.sig` and `latest.json`; it was published and is Latest (2026-11-11).
- [ ] A tag that does not match the version files fails at the first step (not run).
- [ ] Non-debug installer: its update check reads the published latest release. (The installed 0.1.1 app reads the real feed over TLS, 2026-11-11; which installer it is was not recorded, so this stays open.)
- [ ] Publish a draft: an installed older build offers it, installs, and restarts into the new version.

## GenieX CLI as a runtime: install, update, uninstall (not yet run in the app)

- [ ] Settings > Runtimes lists GenieX CLI first, with its logo, installed version or "Not installed", latest version and repo. The "…" menu has Release notes, Uninstall (disabled when not installed) and, when not installed, Check again.
- [ ] Install GenieX (not installed): Install queues an entry in the Downloads drawer. Stages: Checking release, Downloading (with bytes), Verifying, Installing…, Done. No installer window appears (the setup runs silently). Toast "GenieX CLI installed"; the card shows the version; Models, Chat and Benchmarks unlock without a restart.
- [ ] After success the setup `geniex-cli-setup-windows-arm64-v<version>.exe` is gone from the app data folder (`%APPDATA%\com.localgenie.app\`). After a failed or cancelled install it stays there.
- [ ] Update: with an older GenieX installed, the card offers Update; the drawer runs it and the card shows the new version.
- [ ] While an install or update of a runtime is queued or running, its card's "…" menu is disabled.
- [ ] Cancel during Downloading: the entry shows cancelled; Resume downloads again. Cancel during Installing: the drawer stops waiting. If the setup was running, it finishes with no window (check Task Manager and the version afterwards).
- [ ] Uninstall: "…" > Uninstall, then confirm. The confirm text names what stays locked. The card shows a spinner; no uninstaller window appears; the server started by the app stops; toast "GenieX CLI removed"; the card shows Not installed; Models, Chat and Benchmarks lock with tooltips.
- [ ] Lock tooltips: with GenieX removed, the sidebar's Models, Chat and Benchmarks are disabled and their tooltip reads "Needs the GenieX CLI. Install it in Settings > Runtimes."; the Playground landing's OCR row is disabled with the same reason.
- [ ] Route guard: with GenieX removed, a navigation to /models, /chat or /benchmarks (for example from the dev console) lands on Settings > Runtimes with the toast "This area is unavailable".
- [ ] Overview: with GenieX removed, Browse Models and Start Local Chat are disabled with the tooltip; "Models Installed" shows "—"; the "Open Runtimes" block opens Settings > Runtimes.
- [ ] Playground landing: with stable-diffusion.cpp missing, Text to image, Image to image and Image upscaling are disabled; with sherpa-onnx missing, the Audio row is disabled. Each row names the runtime and points to Settings > Runtimes.
- [ ] Settings landing: the Runtimes row shows "No runtime installed" when none is installed, or "A runtime update is available" when one has a newer release, with a warning icon.
- [ ] Start with GenieX missing: Models, Chat and Benchmarks show locked once the runtime list has been read (nothing is locked before that).

## Model cards and detail pages (c6f6bea, 2026-11-04)

The user looked at the cards and the detail pages in the app on 2026-11-04 and said they look okay for now. The items below were not run in the app and not ticked.

- [ ] Card layout and clipping: at narrow widths (down to the 860 px sidebar collapse) titles, capability icons, fact items and the RAM badge wrap or truncate without overlapping. Long model names truncate with the full name in the tooltip.
- [ ] Tooltips: hover and keyboard focus on each info icon (updated, details), each fact (task, params, quantisation, context, licence, disk), the RAM badge and the Hub downloads and likes; the text matches the card.
- [ ] Capability icons on a Hugging Face card: a known vision model, a tool-calling model and a thinking model show the matching icon, and the detail page says "(inferred)". On an installed model the icons match the confirmed scan (not the Hub guess).
- [ ] RAM verdicts: a small model shows a fit and a large one (for example 70B) shows "May not fit" on this PC; "estimate" appears when the parameter count is approximate.
- [ ] AI Hub first load: with the cache empty (first open after start), time from opening the tab to the cards with their info lines. Record the time; the list waits for every info file.
- [ ] AI Hub detail: Capabilities & compatibility, Specifications and About show for a model that has them and hide when empty; TTFT and Response Rate are not listed; the research paper link opens in the browser.
- [ ] AI Hub card for a model whose info file cannot be read: the row shows with the `QAIRT · N chipsets` line.
- [ ] Hugging Face detail: Specifications shows Created, Updated, Downloads (30 days and all time), Likes, Quantised versions and the Base model link. With the second (`expand[]`) request blocked, the page still loads and the two counts are missing.
- [ ] Installed model page: Specifications shows precision, context window, parameters and RAM needed from the stored row; the card's info tooltip reads "Source: Hugging Face" for `hf` and "Source: Qualcomm AI Hub" for `aihub`.
- [ ] Search results: no variant list on the card (the quantisation picker is on the detail page), and no Installed pill on any card.

## Sidebar usage chart with Playground jobs (committed 9a18c4f; text to image and OCR lines confirmed by the user)

- [ ] No model loaded and no job: no usage card in the sidebar.
- [ ] Text to image with device Auto: the card appears with CPU, GPU and NPU lines; with a GPU device chosen, only the GPU line.
- [ ] Same job with no model loaded: the RAM section shows System only, with no "Model / context" row.
- [ ] Image to image and upscaling: CPU line only. Speech: CPU line only.
- [ ] OCR with compute Auto and vision encoder NPU: CPU, GPU and NPU lines. With compute CPU and vision GPU: CPU and GPU lines only, even if a model is loaded on another target.
- [ ] Legend latest % matches the last point of its line. A target this device gives no counter for is not listed.
- [ ] Leave the Playground tab during a job and come back: the lines are still plotted.
- [ ] The card disappears after a job ends when no model is loaded, and stays while a model is loaded.

## General build sanity

- [ ] `npm run check` passes (TypeScript, no errors).
- [ ] `npm run lint` passes (Biome — 0 errors, 0 warnings as of 2026-09-18).
- [ ] `cargo check` passes in `src-tauri/` (no warnings introduced).
- [ ] `npm run build` produces MSI + NSIS bundles under `src-tauri/target/release/bundle/`.
- [ ] App launches from the built bundle and the server connects on the configured port (default `18181`).

## Chat attachments (not yet run)

- [ ] Attach menu: Image and Audio are disabled until the model's settings scan confirms vision or audio; Text file is always enabled. Up to 4 files per message.
- [ ] Send an image and an mp3 clip (mp3 is not verified with the server; see known-issues). The reply uses the content; a wav clip is the verified path.
- [ ] Send a text file, then a second message: the model still has the file, and the context ring shows the file arc.
- [ ] Move a sent file, then send again: the send goes ahead without that file, and a "Files not sent" toast names it. The toast repeats on each send.
- [ ] Delete that message (hover the bubble, trash icon, confirm): the message and every later one leave the chat and do not come back after a reload. The next send has no warning and the model no longer gets the file.
- [ ] Delete a user message in the middle of a chat, then an assistant message: each confirm removes it and all after it, and the context ring drops accordingly. A cancelled confirm changes nothing.
- [ ] Retry and Delete buttons appear only on hover or keyboard focus, and Retry is absent on a message whose file has no stored path.
- [ ] Open a tile, then "Open location": Explorer opens the folder with the file selected.
- [ ] Retry on the last user message re-sends its files; a reply that reports counts shows the exact total in the ring.

## Stitch UI regression (after the 2026-09-18 frontend rebuild)

- [ ] All views render and switch via the sidebar: Overview, Models, Chat, Benchmarks, Settings — without losing active session or server status.
- [ ] Chat: streaming updates in place, `chat-done` records generation stats, retry removes later messages in both Zustand and SQLite.
- [ ] Chat welcome: `/chat` with no open conversation shows the status (Running/Stopped) and Recent conversations (10 a page); New conversation twice opens the same empty draft; leaving an empty draft leaves nothing in the list after a reload; the first send stores it.
- [ ] Pin: a pinned conversation lists first and keeps its place after a reload; unpin returns it to recency order.
- [ ] Models: search → download → import → progress → completion refresh; cancel and resume from the drawer; duplicate click is ignored; Load & Chat sets active model; remove confirmation works; repo filter chips behave.
- [ ] Settings: port save/probe persists.
- [ ] Benchmarks, Run: with a model loaded, start a suite; each step appears as it finishes; the run appears in Runs; Cancel keeps the finished steps; chat and model load are refused until the run ends. Compute and the Windows power plan/battery are recorded for the run (not yet verified against a live model).
- [ ] Benchmarks, Prompt Library: a prompt used by a suite cannot be deleted; a file removed from a saved prompt leaves the disk when no other prompt or step uses it.
- [ ] Overview "Recent Generation Speeds" shows chat-based figures only; Compare charts use the selected runs; CSV and PNG exports open the save dialog and "open" works on the saved file.
- [ ] Responsive: model grid 3→2→1 columns; settings rows stack. (The sidebar collapses only from its toggle; see the navigation section.)
- [ ] Keyboard: Escape closes model-remove dialog; nav items are real buttons (focusable); sliders are labelled via `aria-labelledby`.

## Qualcomm AI Hub tab (not yet run)

- [ ] Models > Qualcomm AI Hub lists models with runtime 11 or 12 and a runnable asset; the name filter and the domain chips narrow the list; the list loads with no network error.
- [ ] A runtime 12 (GGUF) asset downloads through the Hugging Face pipeline, imports, and the model loads; a runtime 11 zip imports and loads (runtime 2, 3 and 6 are not listed).
- [ ] Open a model: domain, licence, model card and QAIRT assets load. With the assets unreadable, the page shows "Assets unavailable" and the model info still shows.
- [ ] With GenieX's `chipset` set to this device's chipset: a universal asset and this chipset's asset download. Another chipset's asset is refused with a "Download failed" toast.
- [ ] A download runs in the drawer, then "Model ready"; the zip and its `aihub--<id>` folder are gone from Downloads. A failed import keeps the zip, and Resume reuses it.
- [ ] After a restart, the imported model is listed under Local, and `list_models` reports its `source` as `aihub` (check the value in the dev console).

## Optional runtimes: Settings > Runtimes (not yet run)

- [ ] The section lists GenieX CLI, stable-diffusion.cpp and sherpa-onnx. Latest versions come from GitHub at startup, when the list changes and every 6 hours; offline, the cards show no latest version and the page still works.
- [ ] Install: the stages show in order (checking, downloading with byte counts, verifying, extracting, done). The card shows the version. `%APPDATA%\com.localgenie.app\runtimes\sd-cpp\<tag>\sd-cli.exe` exists.
- [ ] The archive installed is the ARM64 one (`windows-arm64` in the zip name), even when GitHub's latest release is an x64-only build.
- [ ] After a restart the card still shows the installed version.
- [ ] Update: when a newer ARM64 release exists the card offers Update; the older folder stays on disk.
- [ ] Interrupt a download (disconnect), then retry: the `.part` file is reused and the install completes. A bad archive or a missing `sd-cli.exe` shows an error and leaves nothing in `runtimes\sd-cpp\`.
- [ ] Uninstall (from the card's "…" menu, after the confirm): the card shows a spinner and a toast reports the result; the runtime folder and the card's version are gone. The Playground then shows the "not installed" notice.

## Playground: text to image (not yet run)

- [ ] The header selector's Recommended section lists the three models (SD 1.5 Q4, FLUX.2 klein 4B Q4, Z-Image Turbo Q4) with sizes and a Download button (see the selector items above).
- [ ] Download SD 1.5 Q4 (about 1.7 GB): per-file progress in the drawer, "Model downloaded" toast, the model is Installed in the selector. Cancel part-way: the drawer shows Paused; Resume continues.
- [ ] FLUX.2 klein and Z-Image Turbo share the Qwen3-4B text encoder. Downloading the second one fetches only its own files. Deleting one keeps the encoder while the other is downloaded; deleting both removes it. Deleting shows the bytes freed.
- [ ] Delete and Download are refused while the model is generating or downloading.
- [ ] Generate SD 1.5 Q4 at 512 x 512, 20 steps, Run on Auto (header selector): the phases show in order (loading, encoding, sampling with a step count, decoding, saving). The image shows, and a `.png` named from the prompt, time and seed is in `Pictures\LocalGenie`. Reveal in Explorer selects it.
- [ ] Same prompt and a fixed seed twice on CPU: the two images match.
- [ ] Random seed: the seed used is shown with the result, and the same seed reproduces it.
- [ ] Generate before the model is downloaded, or with the runtime removed: refused with a message.
- [ ] Negative prompt is disabled for FLUX.2 klein and Z-Image Turbo; CFG is disabled for them too.
- [ ] Cancel during sampling: the status is cancelled, the process is gone (Task Manager), and no PNG is written.
- [ ] Leave Playground during a generation and come back: the progress and the result are still there (`PlaygroundRuntime` keeps listening).
- [ ] Close the window during a generation: the sd-cli process ends.
- [ ] GPU (only if the build lists one): with CFG 1.0 the image is not blank; with CFG above 1 check for the white-image bug (known-issues). Expect it to be slower than the CPU.

## Playground: image to image (not yet run)

- [ ] The selector lists SD 1.5 Q4 (re-draw, strength slider) and FLUX.2 klein 4B Q4 (edit) for this tool; Z-Image Turbo is not listed. Generate stays disabled until an image is chosen.
- [ ] Choose image offers only png/jpg/jpeg; the preview shows and the size fields follow the picture.
- [ ] SD 1.5 re-draw at 256 px, 10 steps, strength 0.6 on CPU: a picture is made (not blank; quality is rough). A strength outside 0.05..1.0 is refused.
- [ ] FLUX.2 klein edit at 256 px, 4 steps: the result applies the instruction ("What to change").
- [ ] A result made in Text to image does not show in Image to image, and the reverse. "Use this image as input" on a text-to-image result switches to Image to image with it as input.
- [ ] Cancel, leaving the tab and coming back, and closing the window behave as for text to image.

## Playground: Audio tool (merged 2026-11-05; the user tested it and reports it works as intended; none ticked)

Limits are in `known-issues.md` ("Audio tool").

Entry and runtime:
- [ ] The Playground landing has one Audio row. With sherpa-onnx missing it is disabled with its reason and points to Settings > Runtimes; the tool shows the not-installed notice.
- [ ] Install sherpa-onnx in Settings > Runtimes: the `win-arm64 ... MinSizeRel.tar.bz2` archive installs, and `runtimes\sherpa-onnx\<tag>\bin\sherpa-onnx-offline.exe` and `sherpa-onnx-offline-tts.exe` exist.
- [ ] Old links: `/playground/speech-to-text`, `/playground/text-to-speech` and `/playground/audio-to-audio` open Audio on Speech to text, Text to speech and Clean up and split.
- [ ] The header selector lists the active task's models, titled "Audio: <task>", with a CPU only row. The Audio card has no compute note.

Models:
- [ ] Speech to text lists Whisper tiny (English) and Moonshine base (English); Text to speech lists Kokoro v1.0 (int8). Download each (about 110-130 MB): progress, Ready, cancel and resume; delete frees the folder.

Speech to text:
- [ ] A .wav file: its waveform shows under the input; the phases show (loading, transcribing); the transcript appears, and Copy puts it on the clipboard. A non-WAV file is refused. Silence gives "No speech was recognised."
- [ ] Microphone: while recording the input shows no waveform; after Stop the clip shows with its waveform and transcribes. A copy is in the app cache `playground-audio` folder, and recordings older than a day are removed on the next save.

Text to speech:
- [ ] Voice and Speed sit on one row. Pick a voice and speed and generate: a `.wav` appears in `Music\LocalGenie`, the result shows a waveform player, and Show in folder selects the file. Text with accents or curly quotes still speaks (non-ASCII is converted).
- [ ] Use as input on a speech result: the file becomes the Speech to text input and the task switches to Speech to text.

Clean up and split:
- [ ] Both outputs show a player each, with its own Use as input. Show in folder works; the info icon next to the button explains the saved files. Cancel stops the process.

Players:
- [ ] Play, back and forward 10 s, dragging the playhead, arrow keys (5 s; Shift for 10 s), Home and End. The played part is in the brand colour, and the time reads `m:ss`. Starting one clip pauses the other.

Jobs and leaving the tool:
- [ ] Cancel a job: the status is cancelled and no process remains. Close the window during a job: the process ends.
- [ ] Leave the tool during a job and come back: the progress is still there. Leave after a finished job and come back: the result and the inputs are gone; the task, model, voice, speed and clean up or split choice are kept.

Not yet run:
- [ ] Offline: a speech model download with no connection shows the offline text (GitHub); Retry works after reconnecting.
- [ ] Voice cloning: in Text to speech pick Pocket TTS (voice cloning) and download it (98 MB). The voice and speed row is hidden and a Voice to copy input appears. Generate stays disabled until a clip is chosen; the output plays and sounds like the clip. Kokoro still shows its voices and speed.
- [ ] A WAV over 10 MB: the input preview shows an error; note whether the job still runs on it.
- [ ] A long clip (several minutes): the waveform takes a while to draw, and the page stays usable meanwhile.

## Conversation compaction (tested by the user on 2026-11-02: the main flow with a 2048 window, the summary row and a second summary; the items below were not ticked one by one)
- [ ] Settings > Compact long conversations: off by default; the threshold slider (50 to 90, default 70) appears only when the switch is on; Save persists after a restart.
- [ ] With it off, a prompt over the context shows the usual error. No summary, no button.
- [ ] With it on, a small context (for example nctx 2048) and a chat that passes the threshold: "Summarising the conversation…" shows, input is disabled, then a "Conversation summarised automatically" line appears just before the prompt and the reply arrives.
- [ ] Clicking that line (mouse and keyboard) opens and closes the summary text. The summary has no thinking text and reads as bullet points.
- [ ] Delete and Retry are gone on the summarised messages and on the summary line; messages after it keep Delete; Retry is only on the last user message.
- [ ] Deleting or retrying the prompt that triggered the summary keeps the summary.
- [ ] The summary survives a restart and keeps its place. The context ring drops after the summary and keeps counting from it (always an estimate, shown with a ~).
- [ ] Stop during the summary: the history is unchanged, the input is enabled, nothing is sent.
- [ ] Overflow with the setting on: a prompt over the window summarises and retries once; when it still does not fit, the error shows.
- [ ] Turning the setting off keeps existing summaries in effect and stops new ones.
- [ ] Check the server logs: the request after a summary carries the summary in the system prompt and the model does not reload.

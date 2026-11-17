# Dispatch (agent mode): plan

Status (2026-11-16): phase A (background shell) and phase B built, not yet run in the app. Request approval tools work in Dispatch through the chat's approval dialog, and the conversation shows Needs you while it waits. Dispatch has its own tool states in Settings > Tools; a tool with none set is On in Dispatch (the chat state does not reach Dispatch). REDESIGNED 2026-11-16 by the user: a Dispatch item is a long-lived background conversation, not a one-shot task: no step, time or repeat limits (loop protection later), several conversations (one turn at a time, others Queued), tools through a popup like chats (On in Settings and enabled for the conversation), a plain reply ends a turn ("Ready"), dispatch_done and dispatch_ask removed, dispatch_notes kept. Sections below that mention limits, dispatch_done, dispatch_ask or needs_you describe the first design and are superseded; `dispatch_create` takes only goal and allowedTools.

Status (2026-11-18), four efficiency changes, code and unit tests only, not run in the app. Profile: a Dispatch sampling profile (Settings > Application & Runtime > Dispatch card) is applied to every Dispatch request over the model's settings and under the chat's overrides; it never touches load settings. Prefix stability: the system prompt is static, the notes go in a final user message for that request only, and a Dispatch date block rounds to the day, so the server's cached prefix survives a notes change. Result budget: `resultMaxChars` (15% of the context window, 3.5 characters per token, 1,500 to 40,000) is sent with each Dispatch tool call and needs the Rust argument. Soft guard: the 4th identical call in a row is not run and gets a nudge; the turn stops after 3 nudges or 6 error results in a row.

## What it is
A personal assistant page. The user hands over a goal; LocalGenie works on it in the background with the loaded model, the tools set to On, MCP tools and compaction, then reports back. A task can pause to ask the user, or to get a tool approved.

## Facts this rests on (checked 2026-11-15)
- GenieX server (source in `C:\Work\GenieX`): every `/v1` request runs behind one global lock, so requests are serialized and queue without a limit; no request timeout; a non-streaming request is not cancelled when the client leaves, a streamed one stops through a flag; one model is held, another model or other load params swap it (no error); idle unload defaults to 300 s (`--keepalive`); tool calls work through per-family parsers; a prompt that does not fit returns 400 `context_length_exceeded`.
- LocalGenie today: the chat tool loop is frontend code (`services/chatSend.ts`, `toolLoop.ts`, `utils/toolLoop.ts`: 5 rounds, 4 calls per round), plain async with zustand state, so it keeps running when the chat page unmounts and takes an explicit `sessionId`. Nothing starts a send for a background session, and `ChatInput` allows one stream app-wide (`busy = isStreaming || compacting`). Stop is `abortToolLoop` plus `cancel_chat_completion`. Approvals go through `toolApprovalStore` and `ToolApprovalDialog`.
- Backend: a tray exists (`tray.rs`, left click shows the window, no menu); the window close handler only handles `Destroyed` (kills server, jobs, MCP servers); no `CloseRequested`, no autostart, no single-instance plugin; `tauri-plugin-notification` is already installed. `chat_sessions` has no `kind` column; `messages` has `kind` (text, system, tool). A `CloseGuard` exists in `Layouts.tsx`; read it first, it may overlap.
- Load params are sent with every chat request, so a model the server unloaded is loaded again by the next request.

## Design

### Run model
A task is a chat session of kind `dispatch` plus a `dispatch_task` row. Messages, tool lines, compaction and the transcript renderer are reused. The chat list does not show dispatch sessions.

The loop is a new service, `src/services/dispatchRunner.ts`, built from the existing pieces (`streamReply`, tool execution, approval, `compactConversation`). It differs from the chat loop in: its own step counter instead of 5 rounds, no tool-less last round, the three Dispatch tools, and a state machine. It runs in the frontend for now (the window is hidden, not destroyed, when it goes to the tray). A Rust loop would survive a dead webview but would duplicate the tool loop; revisit only if the first spike shows the hidden webview is throttled to uselessness.

Status: `queued`, `running`, `needs_you` (a question or an approval), `done`, `failed`, `stopped`, `interrupted` (app restarted while it ran; Resume continues from the stored messages).

One model call at a time, and it shares the server with chat. While a task is `running`, the chat input is disabled with "Dispatch is using the model" (the server would queue a chat message behind a long call and the app's 300 s limit would fail it). A task paused as `needs_you` frees the model. Pause and Stop are always available.

### Limits (stop a small model from looping)
Defaults, per task and editable at creation: 40 steps, 60 minutes, the same tool call with the same arguments 3 times in a row stops the task as failed with that reason. A per-call watchdog (the app's 300 s time-to-first-output limit already exists in Rust) turns a hung call into a failed step, not a hung task. Compaction is forced on for the task through the per-chat override (threshold 70).

### Tools the agent gets
- `dispatch_done(report)`: ends the run; the report is what the user is notified about.
- `dispatch_ask(question)`: sets `needs_you` and waits for an answer typed on the Dispatch page; the answer is the tool result.
- `dispatch_notes(text)`: replaces a short plan or notes text (the whole text, at most about 1,500 characters). The notes are injected into the system prompt on every call, so they survive compaction. Small models plan poorly; this is the cheap fix.
These live in the Rust tool registry as a source `Dispatch`, are hidden from Settings > Tools and from chat, and are offered only by the runner.
Other tools: at task creation the runner snapshots the tools that are On. The user can untick some for this task. A tool set to Request approval pauses the task as `needs_you` with the approval shown on the Dispatch page and a notification. A tool set to Off is not offered.

### Safety
- An unattended task has no human reading tool output. The existing rule stays: tool results are data, not instructions.
- A read tool plus a network tool (web fetch) is an exfiltration route by URL. The task form warns when both are in the snapshot. Writing tools (phase 2) always need approval.
- Secrets in MCP env and headers are already plain text in the DB; nothing new.

### Background (own piece of work, independent of the runner)
- Closing the window hides it to the tray (`CloseRequested` + `prevent_close`). Setting "Keep running in the tray when closed", off by default (user decision 2026-11-15); off keeps the old close.
- Tray menu: Open LocalGenie, Exit. Exit asks "A Dispatch task is still running. Exit and stop it?" when a task is `running` or `needs_you`; otherwise it exits at once. Exit kills the server, MCP servers and jobs as today (`Destroyed`).
- Start with Windows: `tauri-plugin-autostart`, a setting, off by default, started with a `--minimized` argument so the window stays hidden.
- `tauri-plugin-single-instance`: a second launch shows the window of the running one (needed once the app lives in the tray).
- Tray status (built, phase A+): the tray tooltip shows the running activities and a Windows notification says when one finishes while the window is hidden (`tray_set_tooltip`, `notify_if_hidden`; frontend `TrayStatusRuntime` with a list of activity sources, downloads first). Dispatch registers its own source: a running task as a tooltip line, and a notification when a task ends or needs the user. Notification clicks do not open the app (not supported on desktop by the plugin).

## Data (IPC contract, camelCase)
- Migration: `chat_sessions.kind` text, default `chat`; table `dispatch_task` (`id`, `session_id` FK unique, `goal`, `status`, `allowed_tools` JSON, `limits` JSON, `notes`, `report`, `error`, `steps`, `created_at`, `started_at`, `finished_at`).
- `DispatchTask { id, sessionId, goal, status, allowedTools: string[], limits: {maxSteps, maxMinutes}, notes, report?, error?, steps, createdAt, startedAt?, finishedAt? }`.
- Commands: `dispatch_list() -> DispatchTask[]`, `dispatch_create(goal, allowedTools, limits) -> DispatchTask`, `dispatch_update(id, patch)` (status, notes, report, steps; used by the runner), `dispatch_delete(id)` (removes the session too). Event `dispatch-task-changed`.
- Tray and window: `app_exit_requested` event to the frontend when Exit is chosen from the tray; `app_exit(confirmed)` command; setting keys `keep_running_in_tray`, `start_with_windows` (autostart plugin state is the source for the second).

## Phases
1. **A. Background shell** (rust-expert, small, independent): `CloseRequested` hide, tray menu with Exit and the confirm, single-instance, autostart with `--minimized`, the two settings, notification helper. Spike first: leave a long async loop running with the window hidden for 10+ minutes and confirm it does not stall.
2. **B. Runner MVP** (repo-default splitting rust and react): migration and commands, Dispatch page (list, new task form, task view with the transcript, notes, status, Stop, Pause, Resume, answer box), `dispatchRunner`, the three tools, limits, compaction override, chat lock, notifications.
3. **Phase 2:** per-task tool allow-list polish, approval inbox, resume after restart, folder write tool with approval, exfiltration warning.
4. **Phase 3:** recurring tasks, notes that persist between tasks, optional external agent runner.

## Risks and open checks
- Small models call tools badly or drift: limits and the repeat check are the guard; expect to tune the system prompt.
- A hidden webview may throttle timers: the phase A spike decides frontend versus Rust runner.
- No cancel for non-streaming requests on the server: the runner always streams.
- Model swap during a task (the user loads another model) changes the server's model: the runner uses the model that was loaded when the task started and fails with a clear reason if it was swapped.
- Unknown: whether GenieX tool calls hold up over 20+ steps with real models. The spike is a manual task with the notes and done tools on a real model.

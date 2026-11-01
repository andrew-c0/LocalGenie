# Automatic conversation compaction

Plan, written 2026-11-01. Research only; nothing is built. Waiting for the user's approval and answers to the open questions at the end.

## What exists today
- The app sends the whole chat history on every request. `historyFor` (`ChatInput.tsx`) maps all messages except `kind: "system"` lines; assistant replies keep their inline `<think>` blocks; stored attachments are re-read from disk each turn. The Rust side (`chat.rs` `chat_completion`) builds the body and streams the reply. Nothing is truncated or summarised.
- The window is the saved `nctx`, else the model's native context, else the server default 4096 (`resolveLoadParams`, `ChatContextHeader`). Used tokens come from `contextUsageOf` (`utils/contextUsage.ts`): the last reply's exact `prompt + completion`, plus a chars/4 estimate for anything newer.
- When the prompt exceeds the window the server answers HTTP 400 `context_length_exceeded`; the app shows an error message. Nothing proactive happens before that.
- Retry, edit and delete all rebuild the history from the stored messages, and delete removes a message and everything after it.
- GenieX has no compaction. It holds one model, serialises requests with a global lock, and keeps the KV cache only while each request extends the previous one (a hash of the messages, `utils/hash.go`). Any other request clears the KV (no model reload); load params must be repeated on any helper call or the model reloads.

## Design

**Non-destructive.** Old messages stay in the database and on screen. A compaction adds one summary message and the history sent to the model is built as: system prompt, the summary, then the messages after the summarised range.

**Storage.** One new message row: `kind = "system"`, `system_type = "summary"`, `content` = the summary text, plus one new nullable column `messages.covers_through_id` (the last message the summary replaces). One migration (`m20261035_…`, pattern of `m20261031_000001_message_kind.rs`), the entity, `save_message`, `services/database.ts` and the `Message` type. `historyFor` finds the newest summary row and uses `[summary] + messages after covers_through_id`; every other path (retry, edit, delete) keeps working from stored messages.

**Consistency for free.** The summary row is created at compaction time, so it sits after every message it covers. Delete and retry remove "this message and everything after", so removing any covered message also removes the summary and the full history is used again. A later summary covers the earlier summary plus the messages since, so summaries do not chain.

**Trigger.** Before a send: when `(used tokens + estimate of the new message) / window >= threshold` and the setting is on. Fallback: when the server returns `context_length_exceeded`, compact once and retry the send automatically (also when the setting is off? see open questions).

**What is kept verbatim.** The last N exchanges (default 2 user/assistant pairs, never less than the latest user message) plus the system prompt. Everything older is summarised.

**The summary call.** A new Rust command (`compact_conversation`) does a non-streamed `POST /v1/chat/completions` on the active server: same model, same load params, `enable_think: false`, `reasoning_format: "none"`, a fixed summarising prompt, `max_tokens` about 15% of the window (capped at 1024). It returns the text; the frontend strips any think block (`parseThinking`) and writes the row. Input is the previous summary, if any, plus the messages to fold in, with `<think>` blocks removed, attachments reduced to "user attached <name>" and long code blocks left as they are. The call can be cancelled; the progress shows as a system line ("Summarising the conversation…").
- The summariser input has to fit the window together with the prompt and the output budget. At a 70% trigger that is about 70% + prompt + 15%, which just fits; if the old part is still too large, summarise it in two passes (oldest half first).
- Cost: one extra model call, which blocks chat on the same server, plus one full re-prefill on the next send because the history prefix changed (the KV is cleared). On a small NPU context this is a few seconds to tens of seconds; not measured.

**Settings.**
- App-wide card in Settings, same pattern as the RAM headroom card (`services/…` + `utils/…` key, default and validator + a Card): "Compact long conversations" switch (default off), threshold slider 50 to 90% (default 70%), "keep the last N exchanges" (default 2). Stored in `user_preferences`.
- Per-chat override (Inherit / On / Off) through the existing chat overrides (`CHAT_OVERRIDE_KEYS` in `utils/chatOverrides.ts` and `model_settings.rs`, the chat settings drawer). Phase 3, not required for a first version.

**UI.**
- The summary shows as a system line in the chat: "Earlier messages summarised", expandable to read the text, with "Undo" (deletes the summary row) and the covered messages greyed or collapsed behind it.
- The context ring and `contextUsageOf` must count the history as sent (summary + remaining), not the stored messages; right after a compaction the figure is an estimate until the next reply gives exact counts.

## Phases
1. **Backend and storage.** Migration, entity, `save_message`, `compact_conversation` command, request builder and prompt as pure, unit-tested functions. Rust agent.
2. **Frontend core.** Settings card and service, `historyFor` with summaries, the trigger in `doSend`, the summary system line (expand, undo), the context ring using the sent history. React agent. Pure functions with vitest: should-compact, range selection, history with summary.
3. **Hardening.** Reactive fallback on `context_length_exceeded`, cancel and progress, two-pass for oversized input, per-chat override, manual "Compact now" button in the chat header.
Each phase leaves the app working. Docs sync after each.

## Risks
- **Quality.** Small local models summarise poorly and can invent or drop facts. Mitigation: visible, undoable summary; a strict prompt (facts, decisions, open tasks, names, numbers, file names); default off.
- **Latency and the global lock.** The summary call stalls chat, and the next send re-prefills. Compaction happens at send time, so the user waits once.
- **Wrong token counts.** The chars/4 estimate can be off by 30% or more (code, non-English). The trigger uses the exact count when available and a lower default threshold to leave margin.
- **Attachments and images.** Images and file contents in the summarised range are not carried over; the summary only names them.
- **Think blocks.** History today resends inline `<think>` text, which wastes context. Stripping it from history (not only for the summariser) would delay the need to compact, but changes every request; kept as an open question.
- **Retry and edit across the boundary** are handled by the delete rule above; edit of a covered message needs a test.
- **Benchmarks and Playground** are not affected (they do not use chat history).

## Open questions for the user
1. Default off or on? (Proposed: off.)
2. Threshold default 70% and keep the last 2 exchanges: agree?
3. Fallback on `context_length_exceeded`: compact and retry automatically even when the setting is off, or only show a "Compact and retry" button?
4. Per-chat override and a "Compact now" button in the first version, or later (proposed: later)?
5. Strip `<think>` blocks from the history sent to the model (separate switch or always)? (Proposed: separate small change, after compaction.)
6. A different, smaller model for summarising? (Proposed: no, same model; revisit only if quality is poor.)

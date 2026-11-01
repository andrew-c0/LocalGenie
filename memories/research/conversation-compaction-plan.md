# Conversation compaction (optional)

Plan, updated 2026-11-01 with the user's decisions. Research only; nothing is built. Waiting for the user's approval of the points under "Still to confirm".

## Decisions (user)
- **Off by default.** Compaction is an option the user turns on, never automatic unless enabled.
- **Summarise the whole conversation up to that point**, not just the old part. Input to the summary is the user's requests and the model's replies only. Thinking sections are never used. The summary is then sent to the model with the next prompt.
- **Same model** for chat and summary. No loading or unloading mid-flight.
- **Context overflow with compaction off:** show the error as today, no button.
- **Per-chat override and a "Compact now" button:** later. **Stripping `<think>` blocks from the normal history:** later, separate change.
- **Retry:** only the last user message may be retried. After a compaction, messages before the summary cannot be retried.

## What exists today
- The whole history is sent on every request. `historyFor` (`ChatInput.tsx`) maps all messages except `kind: "system"` lines; assistant replies keep inline `<think>` blocks; stored attachments are re-read from disk. Nothing is trimmed.
- Window = saved `nctx`, else the native context, else 4096 (`resolveLoadParams`, `ChatContextHeader`). Used tokens: `contextUsageOf` (`utils/contextUsage.ts`) = last reply's exact `prompt + completion` plus a chars/4 estimate for newer messages.
- A prompt over the window gets HTTP 400 `context_length_exceeded`, shown as an error message.
- Retry already exists only on the last user message (`MessageBubble.tsx`, `isLastUserMessage`). Delete is allowed on any message and removes it and everything after it.
- GenieX has no compaction. It holds one model, serialises requests with a global lock, and keeps the KV cache only while a request extends the previous one. Any other request clears the KV (no reload); load params must be repeated on a helper call or the model reloads.

## Design
**Summary row.** On compaction the app adds one message: `kind = "system"`, `system_type = "summary"`, `content` = the summary, plus a nullable `messages.covers_through_id` (the last message folded in). One migration (`m20261035_…`, like `m20261031_000001_message_kind.rs`), the entity, `save_message`, `services/database.ts` and the `Message` type.

**History sent to the model.** System prompt, then the summary (as a block in the system turn, so the transcript stays user/assistant only), then the messages after the summary, which is the new prompt. `historyFor` uses the newest summary row; everything before `covers_through_id` is not sent. A later compaction folds in the previous summary plus the messages since, so summaries do not chain.

**Trigger.** Only when the setting is on. Before a send: `(used tokens + estimate of the new prompt) / window >= threshold`. Then: summarise everything before the new prompt, store the row, send summary + new prompt. Also on `context_length_exceeded` (setting on only): compact the history before the new prompt, then retry once; if it still does not fit, show the error. Setting off: the error as today.

**The summary call.** New Rust command `compact_conversation`: non-streamed `POST /v1/chat/completions` on the active server, same model and load params, `enable_think: false`, `reasoning_format: "none"`, a fixed prompt, `max_tokens` about 15% of the window (cap 1024). Input: the previous summary (if any) and the messages to fold in, each user request and each reply with `<think>` blocks removed, attachments reduced to "user attached <name>". The frontend also strips any think block from the answer (`parseThinking`). Cancellable; progress as a system line. If the input does not fit the window with the prompt and output budget, summarise the older half first, then the rest.
- Cost: the summary call blocks chat on the server and reads a large prompt once. The next request is cheap (summary + new prompt only), but it re-reads from scratch because the KV is cleared. Not measured on the NPU.

**Delete and retry rules.**
- Retry stays on the last user message only. After a compaction nothing before the summary offers retry.
- Covered messages (up to `covers_through_id`) cannot be deleted one by one; the summary line has **Undo**, which deletes the summary row and brings the full history back. Messages after the summary delete as today. Deleting the summary row is the only way back, so the full history can never come back by accident.

**UI.** A system line "Earlier messages summarised" at the summary's position, expandable to read the text, with Undo; covered messages greyed. While compacting, the input is disabled and the stop button cancels (history unchanged). If the summary call fails or returns nothing, show a toast and send the original history unchanged.

**Token accounting.** `contextUsageOf` must count the history as sent: usage from replies before the summary is stale and is ignored; count from the summary onward (summary text and later messages as estimates until the next reply gives exact counts). The ring uses the same.

**Settings.** App-wide card in Settings, like the RAM headroom card: "Compact long conversations" switch (default off) and a threshold slider 50 to 90% (default 70%). Keys in `user_preferences`. No "keep last N" setting: everything before the new prompt is summarised.

## Phases
1. **Backend and storage.** Migration, entity, `save_message`, `compact_conversation`, request builder and prompt as pure unit-tested functions. Rust agent.
2. **Frontend core.** Settings card and service, `historyFor` with summaries, the trigger in `doSend`, the summary line with Undo, covered messages greyed and not deletable, token accounting. Pure functions with vitest. React agent.
3. **Hardening.** Overflow fallback and retry, cancel and progress, two-pass for oversized input.
Each phase leaves the app working. Docs sync after each.

## Risks
- **Quality.** Small models summarise poorly and can drop or invent facts, and exact code or numbers can be lost. Mitigation: visible, undoable summary, a strict prompt (requests, decisions, results, names, numbers, file names, open tasks), off by default.
- **Latency.** Summary call stalls chat once; summarising at 70% of the window reads a large prompt.
- **Token estimate.** chars/4 can be 30% off; the threshold leaves margin.
- **Attachments and images** in the summarised part are not carried over.
- **Model switch.** The summary carries over, but a model with a smaller window may still not fit it.
- **Benchmarks, Playground and OCR** do not use chat history; unaffected.

## Confirmed by the user, 2026-11-01 (these replace the earlier proposals and the delete/undo rules above)
- Threshold default 70% (slider 50 to 90%). The summary goes in the system turn.
- The summary is also a visible system message in the conversation ("Conversation summarised automatically"). Clicking that row opens the actual summary text.
- No undo and no deletion of the summarisation: it is automatic and permanent. Messages covered by a summary and the summary row cannot be deleted. Messages after the summary delete as today.
- The summary row is stored just before the prompt that triggered it (created_at one millisecond earlier), so deleting or retrying that prompt does not remove the summary.

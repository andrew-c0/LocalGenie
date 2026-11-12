# Native tools for models: plan

Status: phases 1-3 built (2026-11-11); phase 5 partly built (2026-11-12: the per-chat tools chip and the image preview on the tool line; the chip's count and grant cleanup and the page charset in phase 3 followed); phase 0 spike skipped; phase 4 MCP and the rest of phase 5 pending. Code and unit tests only: not run with a real tool-capable model, the GenieX server or a live site (see `memories/repo/known-issues.md`, "Native tools"). Facts marked "verified" were read in the GenieX checkout (`C:\Work\GenieX`, `cli/server/handler/`, commit 7904e6dc) or in this repo; everything else is a design choice or an assumption to test in phase 0.

## Decisions taken (2026-11-11, user)
- Native tools first; MCP is a v2.
- First tools: file read (list, read) and web.
- Each tool has three states in Settings: **Off** (not offered to the model), **Request approval** (the user approves each use) and **On** (runs automatically). This replaces the "Ask / Always allow" wording below.
- Tool calls are stored as `tool` messages and drawn like system lines. Clicking a line shows the details, including the parameters the model used (debug information); collapsed by default.
- Web search (decided 2026-11-11, user): our own `web_search` tool with **toggleable sources**, each source a small adapter over one public, documented, keyless API. Start with what we have; add sources later. No bundled metasearch engine and no scraping of Google/Bing/DuckDuckGo. See "Web search" below.

## Goal
Let a chat model call tools (read a file, list a folder, search the web, fetch a page) with the user in control: tools are off until enabled in Settings, each use can need approval, and every call is visible in the conversation.

## What the GenieX server gives us (verified)
- `/v1/chat/completions` accepts the OpenAI `tools` array. It renders them through the model's chat template and parses the reply into tool calls (`chat.go` `parseTools`, `chat_token.go`, `chat_stream.go`).
- Streaming works with tools: each tool call arrives complete in one `delta.tool_calls` chunk (`streamToolCall`), then `finish_reason: "tool_calls"`. Text before the call streams as normal content.
- The request accepts history with an assistant message carrying `tool_calls` and `role: "tool"` replies (`chat_messages.go`, `buildToolCalls`). A tool reply is rendered only from the `tool_calls` of the turn before it, so the pairing must be kept exactly.
- `parallel_tool_calls` defaults to true. There is no `tool_choice` handling (not found in the server): we cannot force or forbid a call per request; "no tools" means not sending `tools`.
- The app already probes tool support per model: the settings scan's `toolCalls` check (`capability_scan/probes.rs`, `get_weather` probe) and the chat-template hint (`modelCapabilities`).

## What the app does today (verified)
- `chat_completion` (`src-tauri/src/commands/chat.rs`) streams SSE and emits only content, `chat-done` (finish reason, usage) and cancel events. `ChatMessage` is `{ role, content }` only; `build_chat_body` has no `tools`. Tool deltas are ignored.
- The send path is in `src/services/chatSend.ts` / `chatRun.ts` / `chatHistory.ts`: one request per send, plus compaction.
- `Message` has `role: user | assistant | system` and `kind: text | system`. System lines (`SystemEventLine`, `systemEvents.ts`) are app-only and never sent to the model; they are stored with `kind` and `systemType` columns.
- Settings: `/settings/{app,runtimes,inference,logs,about}` in `navigation/routes.ts`; cards under `src/components/settings/`; a key/value preferences table exists (used for `notified_app_update`).

## Tools or MCP
They are not alternatives; they sit on different sides of the same registry.
- **Native tool** = a function we implement in Rust, with a name, a description, a JSON schema, a risk level and an `execute`. Full control over consent, limits and logging; no extra processes; works offline except the web tools.
- **MCP** (Model Context Protocol) = an open protocol where separate servers (a local process over stdio, or a remote HTTP server) list their tools (`tools/list`) and run them (`tools/call`). It gives a large ecosystem of tools without writing each one, but each server is third-party code: a stdio server is a program the user tells us to launch, with the user's permissions.
- **Recommendation:** build one **tool registry** with a common `ToolSpec` (id, name, description, schema, risk, source). Ship **native tools first** (small, safe, fully ours). Add **MCP as a second source** into the same registry later, behind its own "add a server" flow with per-server trust. The model-facing code, consent, tracking and UI are written once.
- Small local models handle few tools well (the schemas also use context). So: tools are off by default, only enabled ones are offered, and a chat can switch them off.

## Architecture
### Rust (`src-tauri/src/tools/`, one module per domain)
- `registry.rs`: `ToolSpec`, the list of tools with each one's state, `tool_list` command (specs for the UI and for building `tools`).
- `exec.rs`: `tool_execute(name, arguments, context)` with a timeout, a result size cap (for example 8,000 characters, with a "truncated" note) and cancel support; returns `{ ok, content, truncated, durationMs }`. Errors become a normal result the model can read ("file not found"), never a panic.
- Tools, in order: `list_directory`, `read_text_file` (read-only, limited to folders the user allowed, size cap, text only), then `web_fetch` (GET a URL, readable text), `web_search` (toggleable sources, see "Web search").
- `chat_completion` changes: `ChatMessage` gains optional `tool_calls`, `tool_call_id` and `name`; the request gets an optional `tools` array; the stream loop parses `delta.tool_calls` and the `chat-done` payload (or a new `chat-tool-calls` event) carries the calls and `finish_reason: "tool_calls"`. Not a new command: this stays an IPC contract change to `chat_completion` and must be mirrored in `src/services/geniex.ts`.

### Frontend (orchestration stays in `src/services/`)
- The agent loop is in the frontend because consent is UI: `streamReply` -> if the reply ends with tool calls: for each call, check the tool state (disabled, ask, always) -> ask the user when needed -> `tool_execute` -> store the result -> send history again with the assistant tool calls and the tool results -> repeat. Limits: at most 5 rounds per send and 4 calls per round; stop and say so when reached. Cancel stops the current stream or tool and records the call as cancelled.
- `services/tools.ts` is the only wrapper of the tool commands; `stores/toolStore.ts` holds states, allowed folders and "allowed for this chat" grants; pure rules (what to offer, loop limits, result formatting) go in `utils/tools*.ts` with vitest tests.

## Settings (user control)
New page `Settings > Tools` (`/settings/tools`, a row on the Settings landing, in `routes.ts`):
- A master switch "Let models use tools" (off by default).
- One card per tool: a three-way state **Off** (default) / **Request approval** / **On**, a short description, and its own options: allowed folders for the file tools (add/remove; nothing allowed by default), the source toggles for `web_search`.
- Web search sources are individual toggles on the `web_search` card (see "Web search"). A search sends the query off the device to the enabled sources; the card says which hosts. Keys (only if a key-based source is added later) must not sit in plain preferences: Windows credential store (`keyring` crate; verify) and never in logs or exports.
- Per chat: a Tools toggle in the chat settings (reuses `settingsOverrides`) and a small chip in the input row showing how many tools are on. A model whose scan says "no tool calls" shows the tools as unavailable for it; "unknown" allows them with a note.
- Approval dialog (when a call needs it): tool, the exact arguments, what it will read or send, and the buttons Allow once, Allow for this chat, Deny. Denying returns "The user denied this call" to the model as the tool result, so the model can recover.

## Web search (decided 2026-11-11)
Findings behind it (read from the projects' docs by an agent, not run; 2026-11-11):
- **SearXNG** is Python with no native Windows route. **RustXNG** (AGPL, single binary, `GET /search?format=json`, MCP mode) turned off Google, Bing, DuckDuckGo, Brave, Yandex, Qwant, Mojeek and Yahoo! JAPAN (CAPTCHAs and terms). Its Standard profile is niche open sources (Wikipedia, Mwmbl, Nominatim, crates.io, arXiv, Hacker News, Europe PMC...), about half of questions answered in the top 10 on its own benchmark; ARM64 build unchecked; response schema not documented.
- **degoog** (AGPL, TypeScript on Bun or Docker) has good coverage but scrapes Google/Bing/Brave HTML and fights blocks with stealth transports; engines are third-party code; no Windows binary, ARM64 not stated.
- Neither fits "bundled, open source, reliable". Scraping the big engines ourselves is ruled out.

Design:
- `web_search(query, sources?, limit?)` in `src-tauri/src/tools/web/`. A `SearchSource` trait (id, label, hosts it contacts, `search(query, limit)`) and one adapter per source returning `{ title, url, snippet, source }`, snippet and total size capped. Plain identifiable User-Agent, per-host rate limits, no scraping, no CAPTCHA tricks.
- Settings > Tools > Web search card: one toggle per source, all visible with the host each one contacts. The tool offers the model only the enabled sources and lists what each is good for in its description. With no source enabled the tool is not offered.
- Failures are normal tool results with a clear reason (rate limited, offline, no results), so the model can tell the user instead of guessing. Say in the description that this is not a general web search.
- Starting sources: Wikipedia (first), then candidates Stack Exchange, Hacker News (Algolia), arXiv, GitHub search (about 10 requests per minute unauthenticated), crates.io, npm; the final list is chosen in the spike and phase 3. Later options, not now: a custom address for a SearXNG/RustXNG/degoog instance the user runs (SearXNG-shaped JSON), an optional RustXNG runtime, an API-key provider (labelled as a cloud service).
- `web_fetch(url)`: GET, robots.txt honoured, readable text extracted, size capped, redirects validated, non-public addresses refused. Fetched text is untrusted (see Safety rules).
- Adapters are tested against saved responses; a live check is a manual-checklist item.

## Tracking tool use in the conversation
- Each call is stored as a **tool message** (`role: "tool"`), not a system line: system lines are never sent to the model, but the model needs every result to continue. The assistant message that made the calls stores them (`toolCalls` JSON), the tool message stores `{ callId, name, arguments, status, result, durationMs, approval }` where `status` is `ok | error | denied | cancelled` and `approval` is `auto | once | chat`.
- Display: a muted, collapsible line per call in the same style as `SystemEventLine` (icon, tool name, short argument summary, status, duration; expands to the arguments and the result). Several calls of one reply sit together under it ("Used 2 tools"). A denied or failed call shows in the chat as such.
- Database: one migration adds `tool_calls` and `tool_call_id` (and the `tool` role / `kind` value) to `messages`; forward-only like all migrations. `sea-orm` entity and `services/database.ts` updated.
- Rules the rest of the app must follow: the history builder sends assistant `tool_calls` and `tool` messages in order; deleting or retrying an assistant message removes its tool messages too (pairing); the context estimate counts tool results and the schema of offered tools; compaction turns tool messages into plain text for the summary call; a message count or export treats tool lines as such; `canRemoveFrom` guards stay.
- Optional later: a "Tool activity" list in Settings > Tools reading the same rows, and counts in benchmarks.

## Safety rules
- Off by default, every tool individually enabled, read-only first. No write, delete, move or run-command tool in v1.
- File tools: an allow-list of folders, canonical paths (no `..` or symlink escape), size and type limits, no hidden/system folders unless allowed.
- Tool output is untrusted data. A web page or file can contain instructions aimed at the model ("prompt injection"); results are marked as tool output, capped, and never grant permissions. A call that follows a web result still needs its own approval under "Ask".
- Hard caps: rounds per send, calls per round, runtime per call, result size.
- MCP (phase 4) adds: a server is code the user chooses to run; show the exact command, run it with the user's permissions only after approval, list its tools with per-tool toggles, kill it with the app.

## Phases
0. **Spike (small, before any UI):** with a script against the GenieX server and two or three local models (for example Qwen3 and Llama 3.x sizes the user runs), check the full loop: tools in, `tool_calls` out, a `tool` reply in the next request, the final answer. Record which models do it reliably, how large the schemas are in tokens, what the server does with a `tool` role when the template does not support tools. Output: findings in `geniex-server-behaviour.md`.
1. **Backend plumbing:** `chat_completion` tools/tool-calls support, the registry, `tool_execute` and the two read-only file tools, unit tests. (`rust-expert`)
2. **Frontend loop and tracking:** the send loop, approval dialog, tool messages and their lines, the migration, history/delete/retry/compaction/context rules, `Settings > Tools` with the master switch and the file tools. (`react-expert`, with `repo-default` for the IPC change)
3. **Web tools:** `web_fetch`, then `web_search` with the source trait, the Wikipedia adapter and the source toggles card; more sources one at a time afterwards. Offline handling: a failed tool call is a normal error result, plus a Try again where a settings card loads data. No credential store needed until a key-based source exists.
4. **MCP client:** servers added in `Settings > Tools`, tools merged into the registry; check the Rust MCP SDK (`rmcp`) and its licence first.
5. **Polish:** done (2026-11-12): per-chat tools chip (its count leaves out a `web_search` with no source on), image preview on the tool line. Skipped for now, future ideas (user decision, 2026-11-12): reading PDF and Office (Word) files; a repair button that downloads only the missing vision projector for a model imported without it. Remaining: Tool activity list, more search sources (such as arXiv), audio reading, docs (`codebase-map.md`, `known-issues`, `manual-checklist.md`), the agentic-mode research builds on this.

## Risks and open points
- Reliability: small models call tools badly or loop; the caps and the "unknown/unsupported" labelling limit the damage, the spike measures it.
- Context: tool schemas and results use the window; compaction and the context ring must count them.
- Streaming: a tool call arrives whole after the text, so the UI shows the text, then the call line; a model that writes the call as plain text (no parser match) just shows text.
- The GenieX parser is per model template; a template without tool support cannot call tools at all.
- Open: which sources beyond Wikipedia ship first, whether allowed folders should also be remembered per chat, and the credential store (only when a key-based source is added).
- Search quality: Wikipedia and the other open sources answer facts and technical questions, not news or general queries; the tool says so when it finds nothing.

## Decisions (all taken 2026-11-11, user)
1. Native tools first, MCP in v2.
2. First tools: file read (list, read) and web (fetch, search).
3. Web search: our own tool with toggleable sources, starting with what we have; more sources later.
4. Permission per tool: Off / Request approval / On.
5. Tracking: `tool` messages drawn like system lines, parameters shown on click.

Next: the manual checklist (`memories/repo/manual-checklist.md`, "Native tools"), then phase 4 (MCP) and the rest of phase 5 (polish).

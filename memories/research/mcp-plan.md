# MCP client (phase 4): plan

Status (2026-11-13): built, as the design record below. The remote HTTP server and the stdio demo (added, started, tools used in a chat) were tested by the user on 2026-11-13; the other checks are in `manual-checklist.md`. Where the build differs from this plan: there is no Refresh button (a running server is re-listed only by Edit and Save or Stop then Start; the backend start re-lists but no UI calls it, see `known-issues.md`); a new server is saved with "connect when LocalGenie starts" on; a status is `stopped`, `starting`, `running` or `failed`; start and listing share a 30 s limit, a call 60 s. The system map is `codebase-map.md`, section "MCP servers".

Decided 2026-11-12 (user): users add MCP servers freely; their tools join the tool list. Checked: `rmcp` 3.9.0 (official Rust SDK), Apache-2.0, needs Rust 1.88 (we have 1.94). Features to use: `client`, `transport-child-process`, `transport-streamable-http-client-reqwest`.

## Scope
- Two transports: **stdio** (a program the user names, run with the user's permissions) and **streamable HTTP** (a URL, optional headers).
- A server is saved in the DB (`mcp_server` table). Env values and headers may hold API tokens and are stored as plain text in the local DB (no credential store exists); the form says so.
- Tools of a running server appear in `tool_list` beside the native ones, with `source: "mcp"`, `risk: "external"`, `serverId`, `serverName`. They use the same Off / Request approval / On states (default Off), keyed by their name.
- Tool name = `mcp__<serverSlug>__<tool>`, only `[a-zA-Z0-9_-]`, at most 64 characters, unique across servers. The MCP `inputSchema` is passed through as `parameters`.
- `tool_execute` routes a name starting with `mcp__` to the MCP manager (`tools/call`), under a 60 s limit. Text parts are joined into `content`; other part types are replaced by a short note ("[image omitted]"); the existing result size cap applies. An MCP `isError` result is `ok: false`.
- Lifecycle: enabled servers connect in the background at app start; a failure is shown as Failed with Try again, never blocks startup. Start, Stop and Refresh per server. All child processes are killed when the app exits.
- Not in scope: MCP resources and prompts, sampling, OAuth, `tools/list_changed` notifications (Refresh instead), images from tools.

## IPC contract (camelCase)
- `McpServerConfig { id, name, transport: "stdio"|"http", command?, args: string[], env: {k:v}, url?, headers: {k:v}, enabled }` (`id` empty on save = new, the backend makes a UUID).
- `McpServerInfo { config, status: "stopped"|"starting"|"running"|"failed", error?, toolCount }`.
- Commands: `mcp_server_list() -> McpServerInfo[]`, `mcp_server_save(config) -> McpServerInfo`, `mcp_server_remove(id)`, `mcp_server_start(id) -> McpServerInfo`, `mcp_server_stop(id) -> McpServerInfo`.
- Event `mcp-server-status` with a `McpServerInfo` on every status change; the frontend then reloads `tool_list`.

## Risks
- A stdio server is arbitrary code: the form shows the exact command and a warning; nothing starts until the user saves or presses Start.
- Tool output is untrusted data, like web pages (prompt injection); same rules as the native tools.
- Windows: `npx` is `npx.cmd`; resolve the program through PATH and PATHEXT; hide the console window.
- Schemas cost context; small models cope with few tools.

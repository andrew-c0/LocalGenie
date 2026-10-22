# Plan: rich system prompt editor (blocks + file references)

Status: planned, not started. No code for this has been written yet.

## Goal
Replace the plain system prompt textarea in the Inference & Sampling section (`ModelSettings.tsx`) with a block editor. A system prompt is an ordered list of blocks. Some blocks are filled in at send time:

- **Text**: free text, as today.
- **Date and time**: current local date, time and time zone, resolved on every send.
- **Platform and hardware**: OS and version, CPU architecture, total RAM, and chipset. The OS, architecture and RAM are resolved on every send. The chipset comes from a probe at app startup.
- **Attached file**: a reference to a local text file (`.txt` or `.md`). Its contents are read from disk on every send, so edits to the file are picked up. Only the path is saved.

Hovering over a block shows what it resolves to right now (for example, the current date and time string). There is no full preview panel.

## Decisions
- **Chipset** is probed once when the app starts (`AppBootstrap`) and stored in the model store. It does not change while the app runs, so it is not re-probed per send. If the probe fails or returns `unknown`, the chipset part is omitted.
- **File attachments** are per model.
- **File types**: only `.txt` and `.md`. The picker's extension filter enforces this, and the read command checks it again.
- **Persistence**: the saved block holds the absolute path, the file name and the last known size. The contents are never saved.

## Data model
- `types/index.ts`: `SystemPromptBlock = { id; kind: "text"; text } | { id; kind: "datetime" } | { id; kind: "platform" } | { id; kind: "file"; path; name }`.
- `StoredModelSettings` gets `systemBlocks?: SystemPromptBlock[]`. It is saved per model in `model_settings`, next to the other settings.
- Legacy: rows with only `systemPrompt` load as one text block. Save writes `systemBlocks` and leaves `systemPrompt` unset.

## Composition at send time
- New `utils/systemPrompt.ts`: `composeSystemPrompt(blocks, { now, platform, readFile })` returns one string. Blocks are joined with a blank line. Empty text blocks are skipped.
- Date/time block: a sentence with the weekday, date, time and IANA zone (`Intl`).
- Platform block: "Platform: <os>, <arch>, <RAM> RAM, chipset <name>". The chipset part is omitted when unknown.
- File block: contents read through the `read_text_file` command, wrapped in `--- file: <name> ---` … `--- end of file ---`. If the read fails, the block is skipped and the send-time warning below applies.
- `ChatInput.tsx`: after `chatSettingsFor`, set `settings.systemPrompt` to the composed string. Rust already prepends it as a system message (`chat.rs`, around line 175). Add `systemBlocks` to the strip list in `chatSettingsFor`.

## Missing file warning
- When a new chat is started with a model whose settings contain a file block, check each path (`file_exists` command).
- If a path is missing, show a warning banner in the new chat before the first send. The banner names the file and offers to open the model settings. The send is not blocked, and the missing file is left out of the prompt.

## Platform info
- Startup: `AppBootstrap` calls `configGet("chipset")` once and stores the value in `modelStore`. This also resolves the CLI's host probe up front.
- Rust command `get_platform_info` in `src-tauri/src/commands/system.rs`, returning `{ os, osVersion, arch, totalMemoryBytes }`. It uses `sysinfo` 0.33 (`System::name`, `System::long_os_version`) and `std::env::consts::ARCH`. Register it in `lib.rs` next to `get_system_memory`.
- Frontend: `services/system.ts` adds `getPlatformInfo()`. The result is cached for the session.

## File access (Rust)
- New commands in `src-tauri/src/commands/system.rs` or a new `files.rs`:
  - `pick_text_file()`: opens a native file dialog filtered to `.txt` and `.md`, and returns the absolute path. Needs `tauri-plugin-dialog`, a new dependency with a capability permission in `src-tauri/capabilities/default.json`.
  - `read_text_file(path)`: checks the extension, caps the size at 512 KB, rejects NUL bytes, and returns the UTF-8 text.
  - `file_exists(path)`: returns whether the path is still present.

## UI (`components/ModelSettings/SystemPromptEditor/`)
- Ordered list of block cards. Each card has a kind label and a remove button. Text blocks use a `Textarea`. Date, platform and file blocks show a one-line caption, and a hover tooltip with the value they resolve to right now.
- File block: file name, path, and estimated tokens (about 4 characters per token, from the file read at the time the editor opens).
- Toolbar: Add text, Add date & time, Add platform & hardware, Attach file.
- Footer: total estimated tokens, and the context window (`nctx`) for comparison.
- Use `SettingField` for the label and info icon.

## Files
- New: `utils/systemPrompt.ts` (+ test), `components/ModelSettings/SystemPromptEditor/*`, `services/system.ts` (`getPlatformInfo`, `pickTextFile`, `readTextFile`, `fileExists`), `components/chat/MissingFileBanner/*`.
- Changed: `commands/system.rs` (or `files.rs`), `lib.rs`, `capabilities/default.json`, `Cargo.toml` (dialog plugin), `AppBootstrap.tsx` (chipset probe), `stores/modelStore.ts` (chipset), `types/index.ts`, `utils/modelSettings.ts` (strip list), `ChatInput.tsx`, `ModelSettings.tsx` (replace the System Prompt section), chat start path (missing-file check).

## Verification
- Unit tests: block composition (order, empty blocks, file delimiters, legacy migration), date formatting with a fixed `now`, and the warning logic with a fake `fileExists`.
- Rust: `get_platform_info` returns a non-empty OS and arch. `read_text_file` rejects other extensions, oversized files and NUL bytes. `cargo test` and `cargo clippy`.
- `npm run check`, `npm run lint`, `npx vitest run`.
- Live: with `geniex serve` running, send a message from a model whose system prompt includes a date block. Check the server log or the reply mentions the current date. Move an attached file, start a new chat, and confirm the warning appears.

## Decisions (resolved)
1. **Missing file does not block the send.** The banner is a warning only, and the missing file is left out of the prompt.
2. **`tauri-plugin-dialog` is added** as a dependency during implementation, with its capability permission in `capabilities/default.json`.
3. **File block hover shows only the path and size.** It does not show file contents.
4. **Chipset probe failure omits the chipset part** of the platform line. It does not show "unknown".

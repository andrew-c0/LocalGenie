---
name: ship
description: Runs LocalGenie's usual finish-a-change routine on the current working tree - verify, knowledge-sync, commit, push. Use only when the user types /ship (or asks to "sync, commit and push").
disable-model-invocation: true
---
# Ship the current changes

Run these steps in order for the changes in the working tree. Optional arguments are a hint for the commit subject. Stop and report at the first failure. Never run this on your own initiative: committing and pushing are outward-facing.

1. **Look first.** `git status --short` and `git branch --show-current`. If the tree is clean, say there is nothing to ship and stop. Note the branch; the user normally ships to `main`.
2. **Verify.** Run `npx tsc --noEmit`, `npx biome check src` and `npx vitest run` (summarise counts). If anything under `src-tauri/` changed, also run `cargo check`, `cargo clippy` and `cargo test` in `src-tauri/`. On a failure, fix it if it is trivial and yours, otherwise stop and show the output.
3. **Knowledge sync.** Start the `knowledge-sync` agent (`.claude/agents/knowledge-sync.md`) with `model: "haiku"`. Brief it with: the cursor in `.claude/knowledge-sync.state` versus HEAD, a precise list of what the working tree changes (read `git status` and `git diff` to write it: components, stores, routes, flows, removed files), what is unverified in the app, and these rules: do not commit, do not touch `src/`, `tasks.md` or `tasks-ordered.md`, never write the word "uncommitted" in the docs (the work is committed right after), keep docs short. Wait for it. Skim its report and `git diff --stat memories .claude`; fix doc drift it flagged only if it is a stale comment or doc line you can correct safely.
4. **Commit.** `git add -A`, then commit with a short imperative subject (use the hint if given), a body of a few lines saying what changed and why, and end with the attribution trailer given in the conversation's system reminder (currently `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`). Pass the message with a heredoc. Do not skip hooks.
5. **Push.** `git push` on the current branch. If the branch is not `main`, say which branch was pushed instead of guessing. Never force-push.
6. **Report.** The commit hash and subject, the verification counts, what the sync changed, and what is still unverified in the app (the sync's manual checklist items). Then, if useful, name the next backlog item from `tasks-ordered.md` without starting it.

Rules: do not edit `tasks.md` or `tasks-ordered.md` (user-owned); follow the model roles in memory (plan with Sonnet, work agents on Haiku).

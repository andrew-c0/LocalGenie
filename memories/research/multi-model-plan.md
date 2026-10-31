# Scrapped on 2026-10-31 (memory bandwidth is shared between computes, so loading models on different computes at once was not worth it yet). Steps 1 and 3 were built then reverted; the RAM estimate and headroom part of step 2 was kept.

Notes from 2026-10-30 to 2026-10-31 on loading several models at once, one per compute (CPU, GPU, NPU). The idea was a chat model on one unit and a vision model on another, loaded together. The per-compute servers, the per-compute port settings and the multi-load selector were removed from the code. Open gaps are kept below in case this comes back. The RAM estimate and headroom are in use; see `memories/repo/codebase-map.md`.

## Findings
- A `geniex serve` process holds one model. Loading another model on it drops the first (`memories/repo/geniex-server-behaviour.md`). Several models need one server each.
- Tested live on 2026-10-30 (CLI v0.10.0): three servers on separate ports, Qwen3.5-2B with `compute: npu`, Gemma 4 E4B with `cpu`, Qwen3.5-2B with `gpu`, all answering at once. The server's `/status` `device` field is empty, so the unit actually used is not confirmed.
- CPU, GPU and NPU on this machine share system RAM, and (the reason for scrapping, 2026-10-31) memory bandwidth too. Loading on several units at once did not gain enough to be worth it.

## Risks, if loading several models is revisited
1. **RAM estimate is rough.** Weights from the file size, plus KV cache that grows with `nctx`, plus the projector for vision models. QAIRT bundles differ again. Known constants are unverified (`known-issues.md`).
2. **Unit not confirmed.** A load on the NPU could silently fall back. Check by timing, or ask GenieX for a status field.
3. **Keepalive unloads an idle model after 300 s**, per server. A UI with several servers must read each server's `/status`, not trust its own state.
4. **Server lifecycle.** Start, stop and status per server; stop every server when the app closes; no orphans after a crash.
5. **Per-server start options** (origins, keepalive, `--vit-compute`): per server, or global with a restart of all servers.
6. **Chat state.** History belongs to the model that wrote it. A retry or edit needs that same model. Define what happens when the active model changes mid-conversation or is unloaded.
7. **Playground OCR** sends its own `compute` and `vit_compute`. It must not evict a chat model silently.
8. **Benchmarks** measure speed, so a busy server on another port distorts the result.
9. **Port conflicts.** Another program may hold a set port. A random port is not kept across restarts unless it is stored.
10. **Handoff between models and tools** is out of scope. It overlaps the native tools and agentic mode tasks.

## Open questions
- Keepalive for loaded models (risk 3).
- Whether per-server start options are per compute or global (risk 5).
- How to confirm the compute unit that ran (risk 2).

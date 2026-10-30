# Multiple loaded models, one per compute

Plan, written 2026-10-30. Status (knowledge sync, 2026-10-30): steps 1 and 2 are built but not manually tested; steps 3 and 4 are not started. Open gaps are in `memories/repo/known-issues.md`. Source of the idea: the user wants dedicated models for different jobs loaded at once (for example a chat model on the NPU and a vision model on the CPU), with a way to hand work between them later.

## Findings that make it possible
- A `geniex serve` process holds one model. Loading another model on it drops the first (`memories/repo/geniex-server-behaviour.md`). So one server per model is the way to hold several.
- Tested live on 2026-10-30 (CLI v0.10.0): three servers on separate ports, Qwen3.5-2B with `compute: npu`, Gemma 4 E4B with `cpu`, Qwen3.5-2B with `gpu`, all answering at once. The server's `/status` `device` field is empty, so the unit actually used is not confirmed.
- CPU, GPU and NPU on this machine share system RAM. RAM is the only resource the units share, so it is the one to guard.

## Rules (user decisions)
- At most one loaded model per compute (CPU, GPU, NPU). This is an app limit, not a GenieX one: two models on one unit would each want all of it.
- Each compute has its own server port, set in Settings. A compute without a set port gets a random free port. A random port is stored while the server runs, so the app can find its own servers again.
- One loaded model is **active**: chat talks to it and the selector at the top shows it. The others are **loaded** and wait. Changing the active model between loaded ones is instant, since nothing reloads.
- Benchmarks use the active model, one run at a time, as today.
- Before a load, the app estimates the model's RAM use and refuses (or warns) when it would not fit.

## Risks and gaps to settle
1. **RAM estimate is rough.** Weights from the file size, plus KV cache that grows with `nctx`, plus the projector and vision encoder for vision models. QAIRT bundles differ again. Treat it as a warning with a headroom setting ("never go above X% of RAM"), compare against free RAM at load time, and still handle a failed load.
2. **Unit not confirmed.** A load on the NPU could silently fall back. Check by timing, or ask GenieX for a status field.
3. **Keepalive unloads a model after 300 s idle**, per server. The UI must read each server's `/status`, not trust its own state. Decide between a long keepalive for loaded models and a reload on demand.
4. **Server lifecycle.** Start, stop and status per compute; stop every server when the app closes; no orphans after a crash. Today's "unload all" becomes "stop all".
5. **Per-server start options.** Origins, keepalive, HTTPS and `--vit-compute` need a decision: per compute, or global with a restart of all servers.
6. **Chat state.** History belongs to the model that wrote it. A retry or edit needs that same model. Define what happens when the active model changes mid-conversation or is unloaded.
7. **Playground OCR** sends its own `compute` and `vit_compute` to the server. It must claim a compute slot or use the active server, and not evict a chat model silently.
8. **Benchmarks** measure speed, so a running chat or OCR job on another server distorts the result. Block a benchmark while another server is busy, or warn. Idle loaded models are harmless.
9. **Selector states:** not loaded, loaded on a compute, active; plus the reason a model cannot load (compute taken, RAM estimate too high).
10. **Port conflicts.** Another program may hold a set port. Report it and offer a random port. Decide whether the app adopts a server it finds already running, as it does for the one port today.
11. **Handoff between models and tools** is out of scope here. It overlaps the native tools and agentic mode tasks.

## Steps
1. **Per-compute servers (backend and settings).** Built (afed418, 3c79047, 0cc9a85); not manually tested.
   - Settings: a port per compute (CPU, GPU, NPU), empty means random. Stored in `user_preferences`.
   - Backend: per-compute start, stop and status; a map of running servers by compute; stop all on exit; random port picked and kept. Existing single-server commands keep working for the active compute until the frontend moves over.
   - Frontend: the Settings fields and the service wrappers. No selector change yet.
   - Built state: a random port is not stored (known-issues). The per-compute ports are saved, but no load path uses them yet, so the UI still uses one server, on the main port.
2. **RAM estimate and load check.** Estimate per downloaded model, shown in the dropdown; a headroom setting; the check before a load. Built (ae6e31a, 0cc9a85); not manually tested.
   - Built state: the estimate and the headroom check show as a warning in the selector row. Nothing checks or blocks before a load, so gap 1's "refuses" option is not done.
3. **Multi-load in the selector.** Not started.
4. **Benchmarks and OCR** follow the active and slot rules (gaps 7 and 8). Not started.

Each step ends in a state the app runs in, so the work can stop after any of them.

## Open questions
- Keepalive for loaded models (gap 3).
- Whether per-server start options are per compute or global (gap 5).
- How to confirm the compute unit that ran (gap 2).

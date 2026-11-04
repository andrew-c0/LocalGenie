# More information per Hugging Face model (research, nothing built)

Backlog item: replace the chips on Hugging Face model cards with more useful information. Written 2026-11-03 from the code and a live Hub API probe. No code changed.

## What is shown today
- Browse card (`ui/ModelCard`, `HubModelBrowser`): name, Gated / Installed / Loaded badge, the six facets (task, parameters, library, licence, model tree, quantisation), downloads and likes, the GGUF variants.
- Detail page (`HubModelDetail`, `ModelFacetRow`): the same six facets, the precision list with the fit calculator, the context length (`gguf.context_length`).
- The list request already expands `downloads, likes, tags, lastModified, gated, safetensors, gguf`. `lastModified` is fetched but not shown.

## What the Hub can give (checked live, `GET /api/models/{id}?expand[]=...`)
Valid `expand` fields (the API lists them in its error): `author, baseModels, cardData, config, createdAt, disabled, downloads, downloadsAllTime, evalResults, gated, gguf, inference, inferenceProviderMapping, lastModified, library_name, likes, mask_token, model-index, pipeline_tag, private, safetensors, sha, siblings, spaces, tags, transformersInfo, trendingScore, widgetData, resourceGroup, xetEnabled, childrenModelCount, usedStorage`.

Probe of `unsloth/Qwen3-0.6B-GGUF`:
- `gguf`: `total` (parameters), `architecture`, `context_length`, `chat_template` (about 5 KB), `eos_token`, `totalFileSize`.
- `cardData`: `base_model`, `language` list, `license`, `license_link`, `library_name`, `pipeline_tag`.
- `createdAt`, `lastModified`, `author`, `downloadsAllTime` (`downloads` is the last 30 days), `childrenModelCount` (quantised, finetune, adapter, merge counts), `spaces` (list of Spaces that use it), `config.architectures`, `siblings` (file names, no sizes), `baseModels`.
- Not useful here: `inferenceProviderMapping` (cloud providers, empty for most), `xetEnabled`, `resourceGroup`, `disabled`, `private`, `usedStorage` (whole repo, misleading for a GGUF repo with many quants).
- `evalResults` / `model-index` are rare; show only when present.

## Candidate facts, grouped by what the user decides with
1. **Will it run here** (the most useful, and local):
   - RAM at the default 8K window against the free RAM, from the file size plus the KV estimate (the fit logic exists for the detail page; the card could show one verdict).
   - Runtime and compute compatibility: architecture (`gguf.architecture`, `config.architectures`) against `memories/repo/runtime-compatibility.md`, so a card can say "CPU / GPU" or "not supported by GenieX".
   - Native context (`gguf.context_length`), already read.
2. **What it can do:**
   - Vision: a `mmproj` file in `siblings`, or the pipeline `image-text-to-text`.
   - Tools and thinking, derived from `chat_template` (contains `tools`, `<think>` / `enable_thinking`). A heuristic; label it as such. The app already has a local capability scan for downloaded models, so the card could show the scan result once downloaded and the template hint before.
   - Languages from `cardData.language` (often missing).
3. **Trust and freshness:** `lastModified` / `createdAt` ("updated 3 weeks ago"), author or organisation, licence class (permissive, non-commercial, custom) with the licence link, gated state, `downloadsAllTime` next to the 30-day figure, likes, number of quantised repos built on it (`childrenModelCount.quantized`), Space count.
4. **Lineage:** base model and relation (already there as "Model tree"), plus the child counts.
5. **Benchmarks:** `evalResults` when present. Skip otherwise; do not scrape READMEs.

## Cost and risks
- `gguf.chat_template` is about 5 KB per model, and the list request already pulls the `gguf` expansion, so card-level capability hints cost no new request. `cardData` and `siblings` are heavier and should be fetched on the detail page only.
- `siblings` has no sizes; the file sizes come from the tree endpoint (`/api/models/{id}/tree/main`) that the precision list already uses.
- Hub data is uneven: many repos have no `language`, no `cardData` and no template. Every fact must degrade to "not listed", never to a guess shown as a fact.
- Capability from a template is a heuristic and can be wrong (a template can mention tools but the model can still be poor at them).

## Proposed card (replacing the chips)
- Line 1: title, status badge (Gated / Installed / Loaded).
- Line 2: task, parameters, quantisation range, native context.
- Line 3: capability icons (vision, tools, thinking) with tooltips, language count, licence class.
- Right side: RAM verdict for this machine ("fits", "tight", "too large") and updated date. Downloads and likes become small secondary text.
- Detail page: sections (Overview, Run on this device, Capabilities, Files and quantisations, Lineage, Licence).

## Suggested order, if built
1. Show `lastModified` and the RAM verdict on the card (no new requests).
2. Capability hints from `chat_template` and `siblings` (`mmproj`), with a tooltip that says they are inferred.
3. Detail page: `cardData` languages and licence link, `downloadsAllTime`, child counts.
4. Runtime-compatibility verdict from the architecture.

## Open questions for the user
- Which verdict matters most on the card: RAM fit, runtime compatibility or capabilities?
- Are inferred capabilities (tools, thinking) acceptable on a remote card with an "inferred" label, or only shown after the local scan?
- Should downloaded models (Models tab) show the same richer block, using the stored values and the scan result?

//! Qualcomm AI Hub catalog (read-only, phase 1): models, detail and README.
//!
//! Data comes from the public S3 bucket and GitHub, read at runtime. The catalog version is
//! discovered once per session by probing the bucket (see `resolve_version`); nothing calls PyPI.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use futures_util::{stream, StreamExt};
use prost::Message;
use serde::Serialize;
use tauri::State;

use super::constants::AIHUB_TIMEOUT_SECS;
use super::AppState;
use crate::aihub_proto::model_info::llm_details::CallToAction;
use crate::aihub_proto::model_release_assets::AssetDetails;
use crate::aihub_proto::{
    ManifestModelEntry, ModelDomain, ModelInfo, ModelLicense, ModelReleaseAssets, ModelTag,
    ModelUseCase, Precision, ReleaseManifest, Runtime,
};

/// Fallback catalog release, used when no probed version is found (network down, bucket error).
/// Bump it when a new AI Hub release is adopted.
pub const AIHUB_FALLBACK_VERSION: &str = "0.65.0";

/// Probe window, relative to the fallback: the next `PROBE_PATCHES` patch versions of the fallback,
/// then patch versions `0..PROBE_PATCHES_PER_MINOR` of the next `PROBE_MINORS` minor versions.
/// 5 + 2 * 10 = 25 HEAD requests at most.
const PROBE_PATCHES: u32 = 5;
const PROBE_MINORS: u32 = 2;
const PROBE_PATCHES_PER_MINOR: u32 = 10;
/// Probes in flight at once, and the timeout for each one.
const PROBE_CONCURRENCY: usize = 8;
const PROBE_TIMEOUT_SECS: u64 = 5;

const AIHUB_BASE: &str = "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models";
const README_BASE: &str = "https://raw.githubusercontent.com/qualcomm/ai-hub-models";

/// Cache for AI Hub fetches, managed by Tauri. Holds the session's catalog version and raw
/// protobuf bodies by URL.
#[derive(Default)]
pub struct AihubCache {
    version: tokio::sync::OnceCell<String>,
    bodies: Mutex<HashMap<String, Arc<Vec<u8>>>>,
    /// QAIRT asset URLs of the models opened this session, with the chipsets listed for each (`None`
    /// for an asset not tied to one). A URL can be listed for more than one chipset. The only AI Hub
    /// URLs `download_file` accepts (`check_asset_download`).
    asset_urls: Mutex<HashMap<String, Vec<Option<String>>>>,
}

/// One row of the catalog list. Only QAIRT models appear (see `catalog_entries`).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AihubCatalogEntry {
    pub id: String,
    pub display_name: String,
    pub domain: String,
    pub use_case: String,
    pub is_quantized: bool,
    pub runtimes: Vec<String>,
    pub chipsets: Vec<String>,
    pub tags: Vec<String>,
}

/// One QAIRT asset (a zip) for a model.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AihubAsset {
    pub precision: String,
    /// `None` for an asset that is not tied to one chipset.
    pub chipset: Option<String>,
    pub download_url: String,
}

/// Model info plus its QAIRT assets.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AihubModelDetail {
    pub id: String,
    pub name: String,
    pub headline: String,
    pub description: String,
    pub domain: String,
    pub use_case: String,
    pub license_type: String,
    pub license_url: Option<String>,
    pub source_repo: Option<String>,
    pub restrict_model_sharing: bool,
    pub call_to_action: Option<String>,
    /// `None` when the release assets could not be read; the model info is still returned.
    pub assets: Option<Vec<AihubAsset>>,
}

/// Catalog release version for this session (probed once, see `resolve_version`).
#[tauri::command]
pub async fn aihub_latest_version(
    state: State<'_, AppState>,
    cache: State<'_, AihubCache>,
) -> Result<String, String> {
    Ok(resolve_version(&state.http_client, &cache).await)
}

/// Models in the catalog that have at least one runnable asset. A model whose release assets are
/// missing or unreadable has nothing to download, so it is left out.
#[tauri::command]
pub async fn aihub_list_models(
    state: State<'_, AppState>,
    cache: State<'_, AihubCache>,
) -> Result<Vec<AihubCatalogEntry>, String> {
    let manifest = load_manifest(&state.http_client, &cache).await?;
    let entries = catalog_entries(&manifest);
    let candidates: Vec<(String, String)> = entries
        .iter()
        .filter_map(|e| {
            let urls = find_entry(&manifest, &e.id).ok()?.manifest_urls.as_ref()?;
            Some((e.id.clone(), urls.release_assets.clone()))
        })
        .collect();
    let client = &state.http_client;
    let cache: &AihubCache = &cache;
    let runnable: Vec<String> = stream::iter(candidates)
        .map(|(id, url)| async move {
            has_runnable_assets(client, cache, &url, &id)
                .await
                .then_some(id)
        })
        .buffer_unordered(PROBE_CONCURRENCY)
        .filter_map(|id| async move { id })
        .collect()
        .await;
    Ok(entries
        .into_iter()
        .filter(|e| runnable.contains(&e.id))
        .collect())
}

/// Whether a model's release assets list at least one runnable file. False when they cannot be read.
async fn has_runnable_assets(
    client: &reqwest::Client,
    cache: &AihubCache,
    url: &str,
    id: &str,
) -> bool {
    fetch_release_assets(client, cache, url, id)
        .await
        .map(|assets| !model_assets(&assets.assets).is_empty())
        .unwrap_or(false)
}

/// Model info and QAIRT assets for one model id.
#[tauri::command]
pub async fn aihub_model_detail(
    state: State<'_, AppState>,
    cache: State<'_, AihubCache>,
    id: String,
) -> Result<AihubModelDetail, String> {
    let manifest = load_manifest(&state.http_client, &cache).await?;
    let entry = find_entry(&manifest, &id)?;
    let urls = entry
        .manifest_urls
        .as_ref()
        .ok_or_else(|| format!("AI Hub manifest has no URLs for {id}"))?;
    let info_bytes = cached_bytes(&state.http_client, &cache, require_https(&urls.info)?).await?;
    let info = ModelInfo::decode(info_bytes.as_slice())
        .map_err(|e| format!("Could not read AI Hub model info for {id}: {e}"))?;
    // Only the info is required. A failed assets read still shows the model, with no assets.
    let assets =
        match fetch_release_assets(&state.http_client, &cache, &urls.release_assets, &id).await {
            Ok(assets) => Some(assets),
            Err(e) => {
                eprintln!("AI Hub release assets unavailable: {e}");
                None
            }
        };
    let detail = detail_from(&info, assets.as_ref());
    if let Some(list) = &detail.assets {
        remember_asset_urls(&cache, list);
    }
    Ok(detail)
}

/// Record the asset URLs of an opened model, so a later download of one of them is allowed.
fn remember_asset_urls(cache: &AihubCache, assets: &[AihubAsset]) {
    if let Ok(mut map) = cache.asset_urls.lock() {
        for a in assets {
            let chipsets = map.entry(a.download_url.clone()).or_default();
            if !chipsets.contains(&a.chipset) {
                chipsets.push(a.chipset.clone());
            }
        }
    }
}

/// Check an AI Hub URL before `download_file` fetches it. Only a zip that an opened model listed,
/// for the chipset this device has (or one not tied to a chipset), is accepted.
pub async fn check_asset_download(cache: &AihubCache, url: &str) -> Result<(), String> {
    require_https(url)?;
    let device = device_chipset().await;
    check_remembered(cache, url, device.as_deref())
}

/// The rule behind `check_asset_download`, given the device chipset. Pure apart from the cache read.
fn check_remembered(cache: &AihubCache, url: &str, device: Option<&str>) -> Result<(), String> {
    if !url.ends_with(".zip") {
        return Err(format!("Not an AI Hub asset zip: {url}"));
    }
    let chipsets = cache
        .asset_urls
        .lock()
        .map_err(|_| "AI Hub asset list is unavailable".to_string())?
        .get(url)
        .cloned()
        .ok_or_else(|| format!("Not an AI Hub asset of a model opened in LocalGenie: {url}"))?;
    if chipsets.iter().any(|c| asset_allowed(c.as_deref(), device)) {
        return Ok(());
    }
    let listed: Vec<&str> = chipsets
        .iter()
        .map(|c| c.as_deref().unwrap_or("any chipset"))
        .collect();
    Err(format!(
        "This AI Hub asset is for {}, and this device is {}",
        listed.join(" or "),
        device.unwrap_or("not set to a chipset")
    ))
}

/// A chipset-specific asset is allowed only for the device's chipset. An asset with no chipset is
/// allowed for any device. A device with no chipset set matches none.
pub fn asset_allowed(asset_chipset: Option<&str>, device: Option<&str>) -> bool {
    match asset_chipset {
        None => true,
        Some(asset) => device.is_some_and(|d| same_chipset(asset, d)),
    }
}

/// Whether the device's chipset name is the asset's chipset. AI Hub names a chipset like
/// `qualcomm-snapdragon-x-elite`, while GenieX reports its display name (`Snapdragon X Elite CRD`),
/// so both are compared as lower-case words without the `qualcomm` vendor word. The device name may
/// add one word after the asset's, such as a SKU suffix.
fn same_chipset(asset: &str, device: &str) -> bool {
    let asset_words = chipset_words(asset);
    let device_words = chipset_words(device);
    !asset_words.is_empty()
        && (device_words == asset_words
            || (device_words.len() == asset_words.len() + 1
                && device_words.starts_with(&asset_words)))
}

fn chipset_words(name: &str) -> Vec<String> {
    name.split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty() && !w.eq_ignore_ascii_case("qualcomm"))
        .map(str::to_ascii_lowercase)
        .collect()
}

/// The chipset this device has: the one in GenieX's config (`chipset`), which GenieX sets from
/// its own detection or from the user's choice. None when it is not set or cannot be read.
async fn device_chipset() -> Option<String> {
    super::cli::config_get("chipset".to_string())
        .await
        .ok()
        .flatten()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
}

async fn fetch_release_assets(
    client: &reqwest::Client,
    cache: &AihubCache,
    url: &str,
    id: &str,
) -> Result<ModelReleaseAssets, String> {
    let bytes = cached_bytes(client, cache, require_https(url)?).await?;
    ModelReleaseAssets::decode(bytes.as_slice())
        .map_err(|e| format!("Could not read AI Hub release assets for {id}: {e}"))
}

/// Raw README for a model at the session's release. `None` when the repo has no README (404).
#[tauri::command]
pub async fn aihub_model_readme(
    state: State<'_, AppState>,
    cache: State<'_, AihubCache>,
    id: String,
) -> Result<Option<String>, String> {
    validate_model_id(&id)?;
    let version = resolve_version(&state.http_client, &cache).await;
    let url = readme_url(&version, &id);
    let resp = state
        .http_client
        .get(&url)
        .timeout(std::time::Duration::from_secs(AIHUB_TIMEOUT_SECS))
        .send()
        .await
        .map_err(|e| format!("README request failed: {e}"))?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!("README request returned HTTP {}", resp.status()));
    }
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Could not read README: {e}"))?;
    Ok(Some(text))
}

fn manifest_url(version: &str) -> String {
    format!("{AIHUB_BASE}/releases/v{version}/manifest.pb")
}

fn readme_url(version: &str, id: &str) -> String {
    format!("{README_BASE}/v{version}/src/qai_hub_models/models/{id}/README.md")
}

/// Model ids are folder names in the AI Hub repo. Anything else is refused before it reaches a URL.
fn validate_model_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= 100
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
        && !id.contains("..");
    if ok {
        Ok(())
    } else {
        Err(format!("Invalid AI Hub model id: {id}"))
    }
}

/// Manifest URLs come from the catalog; only https is followed.
fn require_https(url: &str) -> Result<&str, String> {
    if url.starts_with("https://") {
        Ok(url)
    } else {
        Err(format!("Refusing non-https AI Hub URL: {url}"))
    }
}

fn find_entry<'a>(
    manifest: &'a ReleaseManifest,
    id: &str,
) -> Result<&'a ManifestModelEntry, String> {
    manifest
        .models
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| format!("{id} is not in the AI Hub catalog"))
}

async fn load_manifest(
    client: &reqwest::Client,
    cache: &AihubCache,
) -> Result<ReleaseManifest, String> {
    let version = resolve_version(client, cache).await;
    let bytes = cached_bytes(client, cache, &manifest_url(&version)).await?;
    ReleaseManifest::decode(bytes.as_slice())
        .map_err(|e| format!("Could not read the AI Hub manifest: {e}"))
}

/// Catalog version for this session. The first call probes the bucket and caches the result in
/// `cache.version`; later calls reuse it.
///
/// Heuristic, not an API: the bucket answers HEAD 200 for a release manifest that exists and 403
/// for one that does not (listing is denied, so a missing object is reported as 403). The probe
/// checks the candidates in `probe_candidates` and keeps the highest that answered 200. If every
/// probe fails (network down, bucket error) or none is newer, the fallback is used.
async fn resolve_version(client: &reqwest::Client, cache: &AihubCache) -> String {
    cache
        .version
        .get_or_init(|| async {
            let found: Vec<String> = stream::iter(probe_candidates(AIHUB_FALLBACK_VERSION))
                .map(|v| async move { probe_exists(client, &v).await.then_some(v) })
                .buffer_unordered(PROBE_CONCURRENCY)
                .filter_map(|v| async move { v })
                .collect()
                .await;
            highest_available(AIHUB_FALLBACK_VERSION, &found)
        })
        .await
        .clone()
}

/// HEAD on a candidate's manifest. Any error counts as "not available".
async fn probe_exists(client: &reqwest::Client, version: &str) -> bool {
    client
        .head(manifest_url(version))
        .timeout(std::time::Duration::from_secs(PROBE_TIMEOUT_SECS))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// `x.y.z` as numbers. Anything else is `None`.
fn parse_version(v: &str) -> Option<(u32, u32, u32)> {
    let nums: Vec<u32> = v
        .split('.')
        .map(|p| p.parse::<u32>())
        .collect::<Result<_, _>>()
        .ok()?;
    match nums.as_slice() {
        [a, b, c] => Some((*a, *b, *c)),
        _ => None,
    }
}

/// Versions to probe: the next `PROBE_PATCHES` patches of the fallback, then patches
/// `0..PROBE_PATCHES_PER_MINOR` of the next `PROBE_MINORS` minor versions.
fn probe_candidates(fallback: &str) -> Vec<String> {
    let Some((major, minor, patch)) = parse_version(fallback) else {
        return Vec::new();
    };
    let mut out: Vec<String> = (1..=PROBE_PATCHES)
        .map(|p| format!("{major}.{minor}.{}", patch + p))
        .collect();
    for m in 1..=PROBE_MINORS {
        for p in 0..PROBE_PATCHES_PER_MINOR {
            out.push(format!("{major}.{}.{p}", minor + m));
        }
    }
    out
}

/// The highest of `fallback` and the versions that answered 200. Versions that do not parse
/// are ignored. Pure, so the selection rule is testable without the network.
pub fn highest_available(fallback: &str, available: &[String]) -> String {
    let mut best = fallback.to_string();
    let mut best_key = parse_version(fallback);
    for v in available {
        let Some(key) = parse_version(v) else {
            continue;
        };
        if best_key.is_none_or(|b| key > b) {
            best = v.clone();
            best_key = Some(key);
        }
    }
    best
}

/// GET a protobuf body, cached for the session. Failures are not cached.
async fn cached_bytes(
    client: &reqwest::Client,
    cache: &AihubCache,
    url: &str,
) -> Result<Arc<Vec<u8>>, String> {
    if let Some(hit) = cache.bodies.lock().ok().and_then(|m| m.get(url).cloned()) {
        return Ok(hit);
    }
    let resp = client
        .get(url)
        .timeout(std::time::Duration::from_secs(AIHUB_TIMEOUT_SECS))
        .send()
        .await
        .map_err(|e| format!("AI Hub request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("AI Hub returned HTTP {} for {url}", resp.status()));
    }
    let body = Arc::new(
        resp.bytes()
            .await
            .map_err(|e| format!("Could not read AI Hub response: {e}"))?
            .to_vec(),
    );
    if let Ok(mut map) = cache.bodies.lock() {
        map.insert(url.to_string(), body.clone());
    }
    Ok(body)
}

/// Strips the proto enum prefix for display (`PRECISION_W4A16` -> `W4A16`).
fn label(full: &str, prefix: &str) -> String {
    full.strip_prefix(prefix).unwrap_or(full).to_string()
}

/// Runtimes GenieX can run from this tab: QAIRT zips (`geniex_qairt`) and llama.cpp GGUF files.
fn is_supported_runtime(runtime: i32) -> bool {
    runtime == Runtime::GeniexQairt as i32 || runtime == Runtime::GeniexLlamacpp as i32
}

/// Only models with a runnable asset belong in this tab. Unknown enum values become empty strings.
pub fn catalog_entries(manifest: &ReleaseManifest) -> Vec<AihubCatalogEntry> {
    manifest
        .models
        .iter()
        .filter(|m| {
            m.supported_runtimes
                .iter()
                .copied()
                .any(is_supported_runtime)
        })
        .map(|m| AihubCatalogEntry {
            id: m.id.clone(),
            display_name: m.display_name.clone(),
            domain: ModelDomain::try_from(m.domain)
                .map(|v| label(v.as_str_name(), "MODEL_DOMAIN_"))
                .unwrap_or_default(),
            use_case: ModelUseCase::try_from(m.use_case)
                .map(|v| label(v.as_str_name(), "MODEL_USE_CASE_"))
                .unwrap_or_default(),
            is_quantized: m.is_quantized,
            runtimes: m
                .supported_runtimes
                .iter()
                .filter_map(|r| Runtime::try_from(*r).ok())
                .map(|r| label(r.as_str_name(), "RUNTIME_"))
                .collect(),
            chipsets: m.supported_chipsets.clone(),
            tags: m
                .tags
                .iter()
                .filter_map(|t| ModelTag::try_from(*t).ok())
                .map(|t| label(t.as_str_name(), "MODEL_TAG_"))
                .collect(),
        })
        .collect()
}

/// Runnable assets: QAIRT zips (runtime 11) and llama.cpp GGUF files (runtime 12, a Hugging Face
/// URL), sorted by precision then chipset.
pub fn model_assets(assets: &[AssetDetails]) -> Vec<AihubAsset> {
    let mut out: Vec<AihubAsset> = assets
        .iter()
        .filter(|a| is_supported_runtime(a.runtime) && !a.download_url.is_empty())
        .map(|a| AihubAsset {
            precision: Precision::try_from(a.precision)
                .map(|p| label(p.as_str_name(), "PRECISION_"))
                .unwrap_or_default(),
            chipset: a.chipset.clone().filter(|c| !c.is_empty()),
            download_url: a.download_url.clone(),
        })
        .collect();
    out.sort_by(|a, b| {
        a.precision
            .cmp(&b.precision)
            .then_with(|| a.chipset.cmp(&b.chipset))
    });
    out
}

fn detail_from(info: &ModelInfo, assets: Option<&ModelReleaseAssets>) -> AihubModelDetail {
    let non_empty = |s: &Option<String>| s.clone().filter(|v| !v.is_empty());
    AihubModelDetail {
        id: info.id.clone(),
        name: info.name.clone(),
        headline: info.headline.clone(),
        description: info.description.clone(),
        domain: ModelDomain::try_from(info.domain)
            .map(|v| label(v.as_str_name(), "MODEL_DOMAIN_"))
            .unwrap_or_default(),
        use_case: ModelUseCase::try_from(info.use_case)
            .map(|v| label(v.as_str_name(), "MODEL_USE_CASE_"))
            .unwrap_or_default(),
        license_type: ModelLicense::try_from(info.license_type)
            .map(|v| label(v.as_str_name(), "MODEL_LICENSE_"))
            .unwrap_or_default(),
        license_url: non_empty(&info.license_url),
        source_repo: non_empty(&info.source_repo),
        restrict_model_sharing: info.restrict_model_sharing,
        call_to_action: info.llm_details.as_ref().and_then(|d| {
            CallToAction::try_from(d.call_to_action)
                .ok()
                .map(|c| label(c.as_str_name(), "CALL_TO_ACTION_"))
        }),
        assets: assets.map(|a| model_assets(&a.assets)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const QWEN_INFO: &[u8] = include_bytes!("../../testdata/aihub/qwen3_0_6b-info.pb");

    fn asset(
        precision: Precision,
        runtime: Runtime,
        chipset: Option<&str>,
        url: &str,
    ) -> AssetDetails {
        AssetDetails {
            precision: precision as i32,
            runtime: runtime as i32,
            chipset: chipset.map(String::from),
            download_url: url.to_string(),
            tool_versions: None,
            s3_key: None,
        }
    }

    #[test]
    fn readme_url_uses_pinned_version_and_id() {
        assert_eq!(
            readme_url("0.65.0", "qwen3_0_6b"),
            "https://raw.githubusercontent.com/qualcomm/ai-hub-models/v0.65.0/src/qai_hub_models/models/qwen3_0_6b/README.md"
        );
    }

    #[test]
    fn model_id_validation_refuses_path_tricks() {
        assert!(validate_model_id("qwen3_0_6b").is_ok());
        assert!(validate_model_id("").is_err());
        assert!(validate_model_id("../secrets").is_err());
        assert!(validate_model_id("a/b").is_err());
        assert!(validate_model_id("a?b=c").is_err());
    }

    #[test]
    fn https_only_for_catalog_urls() {
        assert!(require_https("https://example.com/x.pb").is_ok());
        assert!(require_https("http://example.com/x.pb").is_err());
        assert!(require_https("file:///etc/passwd").is_err());
    }

    #[test]
    fn model_assets_keep_qairt_and_gguf_and_skip_empty_urls() {
        let assets = vec![
            asset(
                Precision::W4a16,
                Runtime::GeniexQairt,
                Some("chip_b"),
                "https://h/b.zip",
            ),
            asset(
                Precision::W4a16,
                Runtime::GeniexQairt,
                None,
                "https://h/u.zip",
            ),
            asset(
                Precision::Q40,
                Runtime::GeniexLlamacpp,
                None,
                "https://h/g.zip",
            ),
            asset(Precision::W8a16, Runtime::GeniexQairt, Some("chip_a"), ""),
        ];
        let out = model_assets(&assets);
        // The empty URL is dropped; the GGUF is kept beside the two zips.
        assert_eq!(out.len(), 3);
        assert!(out.iter().any(|a| a.download_url == "https://h/g.zip"));
        assert!(!out.iter().any(|a| a.download_url.is_empty()));
        let w4 = out
            .iter()
            .filter(|a| a.precision == "W4A16")
            .collect::<Vec<_>>();
        assert_eq!(w4.len(), 2);
        assert_eq!(w4[0].chipset, None);
        assert_eq!(w4[1].chipset.as_deref(), Some("chip_b"));
    }

    #[test]
    fn catalog_lists_qairt_and_gguf_models_only() {
        let manifest = ReleaseManifest {
            version: "0.65.0".into(),
            platform_url: String::new(),
            models: vec![
                ManifestModelEntry {
                    id: "qwen".into(),
                    display_name: "Qwen".into(),
                    supported_runtimes: vec![
                        Runtime::GeniexQairt as i32,
                        Runtime::GeniexLlamacpp as i32,
                    ],
                    tags: vec![ModelTag::Llm as i32],
                    ..Default::default()
                },
                ManifestModelEntry {
                    id: "gguf_only".into(),
                    supported_runtimes: vec![Runtime::GeniexLlamacpp as i32],
                    ..Default::default()
                },
            ],
        };
        let entries = catalog_entries(&manifest);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].id, "qwen");
        assert_eq!(entries[0].runtimes, vec!["GENIEX_QAIRT", "GENIEX_LLAMACPP"]);
        assert_eq!(entries[0].tags, vec!["LLM"]);
        assert_eq!(entries[1].id, "gguf_only");
    }

    #[test]
    fn manifest_round_trips_through_generated_types() {
        let manifest = ReleaseManifest {
            version: "0.65.0".into(),
            platform_url: "https://h/p.pb".into(),
            models: vec![ManifestModelEntry {
                id: "m".into(),
                ..Default::default()
            }],
        };
        let bytes = manifest.encode_to_vec();
        let back = ReleaseManifest::decode(bytes.as_slice()).expect("decode");
        assert_eq!(back, manifest);
    }

    #[test]
    fn bad_bytes_are_an_error_not_a_panic() {
        assert!(ReleaseManifest::decode(&[0xff, 0xff, 0xff][..]).is_err());
        assert!(ModelInfo::decode(&[0x0a, 0xff][..]).is_err());
    }

    #[test]
    fn real_qwen_info_decodes_with_detail_fields() {
        let info = ModelInfo::decode(QWEN_INFO).expect("qwen info.pb decodes");
        assert_eq!(info.id, "qwen3_0_6b");
        let assets = ModelReleaseAssets {
            model_id: info.id.clone(),
            assets: vec![asset(
                Precision::W4a16,
                Runtime::GeniexQairt,
                None,
                "https://h/q.zip",
            )],
            ..Default::default()
        };
        let detail = detail_from(&info, Some(&assets));
        assert_eq!(detail.id, "qwen3_0_6b");
        assert!(!detail.name.is_empty());
        assert_eq!(detail.assets.as_ref().map(Vec::len), Some(1));
        assert_eq!(detail.domain, "GENERATIVE_AI");
    }

    #[test]
    fn asset_download_accepts_only_this_devices_chipset_or_universal() {
        assert!(asset_allowed(None, None));
        assert!(asset_allowed(None, Some("snapdragon_x2_elite")));
        assert!(asset_allowed(
            Some("snapdragon_x2_elite"),
            Some("snapdragon_x2_elite")
        ));
        assert!(asset_allowed(
            Some("Snapdragon_X2_Elite"),
            Some("snapdragon_x2_elite")
        ));
        // Another chipset, and a chipset-specific asset on a device with no chipset set.
        assert!(!asset_allowed(
            Some("snapdragon_x_elite"),
            Some("snapdragon_x2_elite")
        ));
        assert!(!asset_allowed(Some("snapdragon_x2_elite"), None));
    }

    #[test]
    fn asset_chipset_matches_genie_display_name_with_sku_suffix() {
        // AI Hub's name against GenieX's display name, which can carry a SKU word after it.
        assert!(asset_allowed(
            Some("qualcomm-snapdragon-x-elite"),
            Some("Snapdragon X Elite CRD")
        ));
        assert!(asset_allowed(
            Some("qualcomm-snapdragon-8-elite-for-galaxy"),
            Some("Snapdragon 8 Elite for Galaxy")
        ));
        // Different chipsets, including one whose name only starts the same way.
        assert!(!asset_allowed(
            Some("qualcomm-snapdragon-x-elite"),
            Some("Snapdragon X2 Elite")
        ));
        assert!(!asset_allowed(
            Some("qualcomm-snapdragon-8-elite"),
            Some("Snapdragon 8 Elite for Galaxy")
        ));
        assert!(!asset_allowed(
            Some("qualcomm-snapdragon-x-elite"),
            Some("Snapdragon X Plus 8 Core")
        ));
    }

    #[test]
    fn shared_asset_url_is_allowed_for_any_chipset_it_is_listed_for() {
        // AI Hub lists one zip under two chipsets. The zip is for this device, so it is allowed.
        let cache = AihubCache::default();
        let shared = "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/a/shared.zip";
        let chip = |c: &str| AihubAsset {
            precision: "W4A16".into(),
            chipset: Some(c.into()),
            download_url: shared.into(),
        };
        remember_asset_urls(
            &cache,
            &[
                chip("qualcomm-snapdragon-x-elite"),
                chip("qualcomm-snapdragon-x-plus-8-core"),
            ],
        );
        assert!(check_remembered(&cache, shared, Some("Snapdragon X Elite CRD")).is_ok());
        assert!(check_remembered(&cache, shared, Some("Snapdragon X2 Elite")).is_err());
    }

    #[test]
    fn asset_download_rejects_urls_the_session_did_not_list() {
        let cache = AihubCache::default();
        let chip = |c: Option<&str>, url: &str| AihubAsset {
            precision: "W4A16".into(),
            chipset: c.map(String::from),
            download_url: url.into(),
        };
        let mine = "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/a/mine.zip";
        let other = "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/a/other.zip";
        let any = "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/a/any.zip";
        remember_asset_urls(
            &cache,
            &[
                chip(Some("snapdragon_x2_elite"), mine),
                chip(Some("snapdragon_x_elite"), other),
                chip(None, any),
            ],
        );
        let dev = Some("snapdragon_x2_elite");
        // Accept: this device's zip, and the universal one.
        assert!(check_remembered(&cache, mine, dev).is_ok());
        assert!(check_remembered(&cache, any, dev).is_ok());
        assert!(check_remembered(&cache, any, None).is_ok());
        // Reject: another chipset's zip, a zip with no chipset set, a URL never listed, a non-zip.
        assert!(check_remembered(&cache, other, dev).is_err());
        assert!(check_remembered(&cache, mine, None).is_err());
        let unlisted = "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/x/evil.zip";
        assert!(check_remembered(&cache, unlisted, dev).is_err());
        let not_zip = "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/a/mine.pb";
        assert!(check_remembered(&cache, not_zip, dev).is_err());
    }

    #[test]
    fn missing_release_assets_keep_the_model_info() {
        let info = ModelInfo::decode(QWEN_INFO).expect("qwen info.pb decodes");
        let detail = detail_from(&info, None);
        assert_eq!(detail.id, "qwen3_0_6b");
        assert!(!detail.name.is_empty());
        assert_eq!(detail.assets, None);
    }

    #[test]
    fn highest_available_picks_the_max_version() {
        let found = vec!["0.65.2", "0.66.1", "0.65.4", "not-a-version", "0.65.10"]
            .into_iter()
            .map(String::from)
            .collect::<Vec<_>>();
        assert_eq!(highest_available("0.65.0", &found), "0.66.1");
        // Numeric, not textual, ordering: 0.65.10 beats 0.65.9.
        let patches = vec!["0.65.9".to_string(), "0.65.10".to_string()];
        assert_eq!(highest_available("0.65.0", &patches), "0.65.10");
    }

    #[test]
    fn highest_available_falls_back_when_nothing_answers() {
        assert_eq!(highest_available("0.65.0", &[]), "0.65.0");
        assert_eq!(highest_available("0.65.0", &["junk".to_string()]), "0.65.0");
    }

    #[test]
    fn probe_window_is_bounded_and_covers_the_next_minors() {
        let candidates = probe_candidates("0.65.0");
        assert!(candidates.len() <= 30);
        assert_eq!(candidates.first().map(String::as_str), Some("0.65.1"));
        assert!(candidates.contains(&"0.65.5".to_string()));
        assert!(candidates.contains(&"0.66.0".to_string()));
        assert!(candidates.contains(&"0.67.9".to_string()));
        assert!(!candidates.contains(&"0.65.0".to_string()));
    }
}

//! Settings scan: probes each sampling setting against the running GenieX server and records the
//! result per model (see `model_capabilities.rs`).
//!
//! Probes never read or write the user's saved settings. Each request is built here, with a short
//! prompt, temperature 0 and a small `max_tokens`. Every probe sends the fixed load recipe
//! (`probe_recipe`), so the server keeps the model it has loaded and the result does not depend on
//! the saved settings.
//!
//! The chat template's hints and the file summary (`capabilities::summary_for`) decide which probes
//! run. A saved chat reply that shows a think block is also recorded as evidence (`note_saved_reply`).

mod entries;
mod outcomes;
mod probes;
mod thinking;
mod transport;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use reqwest::StatusCode;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use super::chat_helpers::with_think_token;

use super::capabilities::{self, model_folder, scan_folder};
use super::chat::unless_cancelled;
use super::chat_helpers::{apply_load_params, strip_precision, ModelLoadParams};
use super::cli::get_installed_version_timeout;
use super::constants::{CAPABILITY_PROBE_TIMEOUT_SECS, CLI_PROBE_TIMEOUT_SECS, DEFAULT_BASE_URL};
use super::logs;
use super::server::fetch_loaded_models;
use super::AppState;
use crate::model_capabilities::{
    self, CapabilityEntry, CapabilityKey, CapabilityRecord, CapabilitySource, CapabilityStatus,
    Fingerprint,
};
pub(in crate::commands) use entries::note_saved_reply;
use entries::*;
use outcomes::*;
use probes::*;
use thinking::*;
use transport::*;

/// Requests per probe. An inconclusive request is sent again once.
const ATTEMPTS: u32 = 2;

/// Event sent before each setting is probed.
const PROGRESS_EVENT: &str = "capability-scan-progress";

/// Set by `cancel_capability_scan`, checked between settings and while a request is in flight.
static SCAN_CANCEL: AtomicBool = AtomicBool::new(false);

/// True while a scan runs. Only one scan may run at a time.
static SCAN_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Holds the scan slot. Released when the scan ends, however it ends.
struct ScanGuard;

impl ScanGuard {
    fn begin() -> Result<Self, String> {
        SCAN_ACTIVE
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "A settings scan is already running.".to_owned())?;
        SCAN_CANCEL.store(false, Ordering::SeqCst);
        Ok(ScanGuard)
    }
}

impl Drop for ScanGuard {
    fn drop(&mut self) {
        SCAN_ACTIVE.store(false, Ordering::SeqCst);
    }
}

/// Result of a scan: whether it was cancelled, and the model's stored results afterwards.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub cancelled: bool,
    pub entries: Vec<CapabilityEntry>,
}

/// Payload of `capability-scan-progress`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress<'a> {
    pub(super) model: &'a str,
    pub(super) key: &'static str,
    pub(super) index: usize,
    pub(super) total: usize,
}

/// One line per decided setting in the server logs. Not run and cancelled settings are not logged
/// as results.
fn log_verdict(app: &AppHandle, model: &str, key: CapabilityKey, verdict: &Verdict) {
    let line = match verdict {
        Verdict::Status(status, detail) => {
            format!(
                "[probe] {model} {}: {} - {detail}",
                key.name(),
                status.as_str()
            )
        }
        Verdict::Template(detail) => format!(
            "[probe] {model} {}: {} - {detail}",
            key.name(),
            CapabilityStatus::Accepted.as_str()
        ),
        Verdict::NotRun(detail) => format!("[probe] {model} {}: not run - {detail}", key.name()),
        Verdict::Cancelled => return,
    };
    logs::record(app, "stdout", line);
}

/// Stored results for a model, with staleness against the file and GenieX version now.
#[tauri::command]
pub async fn load_model_capabilities(
    db: State<'_, DatabaseConnection>,
    model: String,
) -> Result<Vec<CapabilityEntry>, String> {
    let name = strip_precision(&model).to_string();
    let fingerprint = current_fingerprint(&name).await?;
    let records = model_capabilities::load(&db, &name).await?;
    Ok(entries(&records, &fingerprint))
}

/// Probes the sampling settings of a loaded model and saves the results. The model must already
/// be loaded; the scan does not load it. Emits `capability-scan-progress` before each setting.
/// Settings not reached after a cancel keep their stored results.
///
/// `load` is the model's load parameters as chat sends them. It is accepted so the frontend call
/// does not change, but the probes always send `probe_recipe()` instead, whatever is passed here.
#[tauri::command]
pub async fn scan_model_capabilities(
    app: AppHandle,
    state: State<'_, AppState>,
    db: State<'_, DatabaseConnection>,
    model: String,
    load: Option<ModelLoadParams>,
    base_url: Option<String>,
) -> Result<ScanResult, String> {
    // The caller's load parameters do not reach the probes. See the doc comment above.
    let _ = load;
    let _guard = ScanGuard::begin()?;
    let name = strip_precision(&model).to_string();

    // The server the app is configured for. The default applies only when none is given.
    let base = base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string());
    let loaded = fetch_loaded_models(&state.http_client, &base)
        .await
        .map_err(|e| format!("GenieX server is not reachable: {e}"))?;
    if !is_loaded(&loaded, &name) {
        return Err(format!(
            "{name} is not loaded on the server. Load it first; the scan does not load models."
        ));
    }
    let fingerprint = current_fingerprint(&name).await?;
    // An unreadable model file leaves the hints unknown, so every probe runs.
    let hints = capabilities::summary_for(&name)
        .await
        .map(|summary| TemplateHints {
            thinking: summary.thinking_hint,
            tool_calls: summary.tool_call_hint,
            vision: Some(summary.has_vision_projector),
            audio: summary.has_audio_encoder,
        })
        .unwrap_or_default();

    let session = Session {
        client: &state.http_client,
        url: format!("{base}/v1/chat/completions"),
        model: name.clone(),
        load: probe_recipe(),
        hints,
        cancel: &SCAN_CANCEL,
    };

    // A plain request first: if the server cannot answer that, no setting can be tested.
    let mut cancelled = match ask(&session, 0.0, &[]).await {
        Ok(_) => false,
        Err(Verdict::Cancelled) => true,
        Err(Verdict::NotRun(text)) => return Err(format!("Baseline request failed: {text}")),
        // A plain request has no template skip, so `Template` cannot come back here.
        Err(Verdict::Status(_, text) | Verdict::Template(text)) => {
            return Err(format!("Baseline request was refused: {text}"))
        }
    };

    let mut results: Vec<(CapabilityKey, Verdict)> = Vec::new();
    let total = CapabilityKey::ALL.len();
    for (index, key) in CapabilityKey::ALL.iter().copied().enumerate() {
        if cancelled || SCAN_CANCEL.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }
        let _ = app.emit(
            PROGRESS_EVENT,
            ScanProgress {
                model: name.as_str(),
                key: key.name(),
                index,
                total,
            },
        );
        let verdict = probe_key(&session, key).await;
        if matches!(verdict, Verdict::Cancelled) {
            cancelled = true;
            break;
        }
        log_verdict(&app, &name, key, &verdict);
        results.push((key, verdict));
    }

    // A decided setting is saved. A not-run one loses its row, unless it is confirmed; `save` applies
    // the write-once rule.
    let updates: Vec<(CapabilityKey, Option<CapabilityRecord>)> = results
        .into_iter()
        .map(|(key, verdict)| {
            let (status, detail, source) = match verdict {
                Verdict::Status(status, detail) => (status, detail, CapabilitySource::Probe),
                Verdict::Template(detail) => (
                    CapabilityStatus::Accepted,
                    detail,
                    CapabilitySource::Template,
                ),
                Verdict::NotRun(_) | Verdict::Cancelled => {
                    return (key, None);
                }
            };
            let record = Some(CapabilityRecord {
                status,
                detail: Some(detail),
                probed_at: chrono::Utc::now().timestamp_millis(),
                fingerprint: fingerprint.clone(),
                source,
            });
            (key, record)
        })
        .collect();
    if !updates.is_empty() {
        model_capabilities::save(&db, &name, updates).await?;
    }

    let records = model_capabilities::load(&db, &name).await?;
    Ok(ScanResult {
        cancelled,
        entries: entries(&records, &fingerprint),
    })
}

/// Asks the running scan to stop. It stops before the next setting, and any request in flight is
/// dropped.
#[tauri::command]
pub fn cancel_capability_scan() -> Result<(), String> {
    SCAN_CANCEL.store(true, Ordering::SeqCst);
    Ok(())
}

#[cfg(test)]
mod tests;

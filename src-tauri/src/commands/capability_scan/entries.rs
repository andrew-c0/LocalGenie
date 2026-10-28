//! Stored results: fingerprint checks, the entries shown to the user, and evidence from saved chat replies.

use super::*;

/// True when the server lists the model, with or without a precision suffix.
pub(super) fn is_loaded(loaded: &[String], name: &str) -> bool {
    loaded
        .iter()
        .any(|m| m == name || m.starts_with(&format!("{name}:")))
}

/// The model's fingerprint now: its weights file and the GenieX version. A model with no GGUF
/// file (AI Hub bundles) has size 0 and mtime 0, so only the GenieX version can make it stale.
pub(super) async fn current_fingerprint(name: &str) -> Result<Fingerprint, String> {
    let folder = model_folder(name)?;
    let files = tokio::task::spawn_blocking(move || scan_folder(&folder))
        .await
        .map_err(|e| format!("Model file read failed: {e}"))?;
    let (size, mtime) = match files.main {
        Some(main) => (
            main.size,
            main.modified
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).timestamp_millis())
                .unwrap_or(0),
        ),
        None => (0, 0),
    };
    let geniex = get_installed_version_timeout(CLI_PROBE_TIMEOUT_SECS)
        .await
        .unwrap_or_else(|| "unknown".to_owned());
    Ok(Fingerprint {
        size,
        mtime,
        geniex,
    })
}

/// Entries for the keys that have a stored result, in scan order, marked stale against `current`.
pub(super) fn entries(
    records: &HashMap<CapabilityKey, CapabilityRecord>,
    current: &Fingerprint,
) -> Vec<CapabilityEntry> {
    CapabilityKey::ALL
        .iter()
        .filter_map(|key| {
            records
                .get(key)
                .map(|r| CapabilityEntry::new(*key, r, current))
        })
        .collect()
}

/// Records a saved chat reply that shows a think block as thinking evidence for `model`. Called when
/// a message is saved. Only positive evidence is recorded: a reply without a block changes nothing.
/// A confirmed thinking result is left alone, so the model file is not read again. The write goes
/// through `model_capabilities::save`, which applies the write-once rule.
pub(in crate::commands) async fn note_saved_reply(
    db: &DatabaseConnection,
    model: &str,
    content: &str,
) -> Result<(), String> {
    if !text_shows_thinking(content) {
        return Ok(());
    }
    let name = strip_precision(model).to_string();
    // Refuses a name that could leave the model cache, before anything is read or written.
    model_folder(&name)?;
    let existing = model_capabilities::load(db, &name).await?;
    if existing
        .get(&CapabilityKey::Thinking)
        .is_some_and(CapabilityRecord::is_confirmed)
    {
        return Ok(());
    }
    let record = CapabilityRecord {
        status: CapabilityStatus::Works,
        detail: Some("A saved reply shows a think block.".to_owned()),
        probed_at: chrono::Utc::now().timestamp_millis(),
        fingerprint: current_fingerprint(&name).await?,
        source: CapabilitySource::Conversation,
    };
    model_capabilities::save(db, &name, vec![(CapabilityKey::Thinking, Some(record))]).await
}

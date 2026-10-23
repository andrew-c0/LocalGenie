//! Probed sampling settings per model, stored one row per key in `model_capability_values`.
//!
//! A row is one result for one key: from a probe run against the GenieX server (see
//! `commands::capability_scan`), from a saved chat reply, or from the chat template. Keys are declared
//! once in `capability_keys!`, as setting keys are in `model_settings.rs`. A row is stale when the model
//! file or the GenieX version it was checked against has changed since, unless it is confirmed.
//!
//! A confirmed row (status `works`) is write-once: `plan_write` decides what a save does to a row, and
//! `save` is the only writer.

use std::collections::HashMap;
use std::sync::OnceLock;

use sea_orm::sea_query::OnConflict;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set, TransactionTrait};
use serde::{Deserialize, Serialize};

use crate::entities::model_capability_value;

macro_rules! capability_keys {
    ($($variant:ident => $name:literal),* $(,)?) => {
        /// Every setting the scan can test. The name is the database key and the key the frontend
        /// uses for the setting.
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
        pub enum CapabilityKey {
            $($variant),*
        }

        impl CapabilityKey {
            /// Every key, in the order the scan runs them.
            pub const ALL: &'static [CapabilityKey] = &[$(CapabilityKey::$variant),*];

            /// The key this result is stored under.
            pub fn name(self) -> &'static str {
                match self {
                    $(CapabilityKey::$variant => $name),*
                }
            }

            /// The key for a stored name, or None when this build does not know it.
            pub fn from_name(name: &str) -> Option<Self> {
                match name {
                    $($name => Some(CapabilityKey::$variant),)*
                    _ => None,
                }
            }
        }
    };
}

capability_keys! {
    Temperature => "temperature",
    TopP => "topP",
    TopK => "topK",
    MinP => "minP",
    RepetitionPenalty => "repetitionPenalty",
    PresencePenalty => "presencePenalty",
    FrequencyPenalty => "frequencyPenalty",
    MaxTokens => "maxTokens",
    Seed => "seed",
    Thinking => "thinking",
    ToolCalls => "toolCalls",
    GrammarString => "grammarString",
    Vision => "vision",
    Audio => "audio",
}

/// What the probe found. `Works` means the effect was seen; `Accepted` means the server returned
/// 200 but the effect was not checked; `Rejected` means the server refused the value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CapabilityStatus {
    Works,
    Accepted,
    Rejected,
}

impl CapabilityStatus {
    /// The stored spelling, as used in the JSON and in log lines.
    pub fn as_str(self) -> &'static str {
        match self {
            CapabilityStatus::Works => "works",
            CapabilityStatus::Accepted => "accepted",
            CapabilityStatus::Rejected => "rejected",
        }
    }
}

/// Where a stored result came from. Stored as `source` in the record's JSON.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CapabilitySource {
    /// A probe request against the server. Rows saved before `source` existed read as this.
    #[default]
    Probe,
    /// A saved chat reply shows the behaviour.
    Conversation,
    /// The chat template or the file summary shows no sign of the feature, so no probe was run.
    Template,
}

/// What the model file and the GenieX version were when the result was found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fingerprint {
    pub size: u64,
    /// Modification time of the weights file, in milliseconds since the Unix epoch. 0 when the
    /// model has no GGUF file.
    pub mtime: i64,
    /// GenieX CLI version, or "unknown" when it did not report one.
    pub geniex: String,
}

/// One stored result. This is the JSON in a row's `value`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityRecord {
    pub status: CapabilityStatus,
    /// Server text for a rejection, or the observation behind a works/accepted result.
    pub detail: Option<String>,
    pub probed_at: i64,
    pub fingerprint: Fingerprint,
    /// Missing in rows saved before this field existed; those read as `probe`.
    #[serde(default)]
    pub source: CapabilitySource,
}

impl CapabilityRecord {
    /// A confirmed result is one whose effect was seen (`works`). See `plan_write`.
    pub fn is_confirmed(&self) -> bool {
        self.status == CapabilityStatus::Works
    }
}

/// A stored result as the frontend sees it, with its staleness already worked out.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityEntry {
    pub key: String,
    pub status: CapabilityStatus,
    pub detail: Option<String>,
    pub probed_at: i64,
    /// True when the file or GenieX version no longer matches the fingerprint. Confirmed results
    /// are never stale.
    pub stale: bool,
}

impl CapabilityEntry {
    pub fn new(key: CapabilityKey, record: &CapabilityRecord, current: &Fingerprint) -> Self {
        Self {
            key: key.name().to_owned(),
            status: record.status,
            detail: record.detail.clone(),
            probed_at: record.probed_at,
            stale: !record.is_confirmed() && record.fingerprint != *current,
        }
    }
}

/// What a save does to one row. See `plan_write`.
#[derive(Debug, Clone, PartialEq)]
pub enum Write {
    /// Insert or replace the row with this record.
    Upsert(CapabilityRecord),
    /// Remove the row.
    Remove,
    /// Leave the row as it is.
    Keep,
}

/// The write-once rule. This is the only place that decides what a save does to a row; `save` applies
/// its answer.
///
/// `existing` is the stored record, if any. `incoming` is what a probe, a saved reply or the template
/// found, or `None` when a probe found nothing or was inconclusive.
///
/// - A confirmed row (`works`) is never overwritten by a record that is not `works`, and is never removed.
/// - A probe's `works` on a confirmed row refreshes only its detail and probed time. Its source and
///   fingerprint stay. A saved reply's `works` leaves a confirmed row alone.
/// - Any other row takes the incoming record, or is removed when there is none.
pub fn plan_write(
    existing: Option<&CapabilityRecord>,
    incoming: Option<CapabilityRecord>,
) -> Write {
    match (existing.filter(|r| r.is_confirmed()), incoming) {
        (Some(confirmed), Some(new))
            if new.is_confirmed() && new.source == CapabilitySource::Probe =>
        {
            Write::Upsert(CapabilityRecord {
                detail: new.detail,
                probed_at: new.probed_at,
                ..confirmed.clone()
            })
        }
        (Some(_), _) => Write::Keep,
        (None, Some(new)) => Write::Upsert(new),
        (None, None) => Write::Remove,
    }
}

/// Parses the stored rows of a model. Rows whose key is unknown, or whose value is not a record, are
/// skipped, so one bad row does not hide the others.
fn records_from_rows(
    rows: Vec<model_capability_value::Model>,
    model_id: &str,
) -> HashMap<CapabilityKey, CapabilityRecord> {
    let mut records = HashMap::new();
    for row in rows {
        let Some(key) = CapabilityKey::from_name(&row.key) else {
            continue;
        };
        match serde_json::from_str::<CapabilityRecord>(&row.value) {
            Ok(record) => {
                records.insert(key, record);
            }
            Err(e) => eprintln!(
                "[model_capabilities] skipping {} for {model_id}: {e}",
                row.key
            ),
        }
    }
    records
}

/// Results saved for a model. See `records_from_rows`.
pub async fn load(
    db: &DatabaseConnection,
    model_id: &str,
) -> Result<HashMap<CapabilityKey, CapabilityRecord>, String> {
    let rows = model_capability_value::Entity::find()
        .filter(model_capability_value::Column::ModelId.eq(model_id))
        .all(db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(records_from_rows(rows, model_id))
}

/// Serialises saves in this process. A save reads a model's rows, decides, then writes; a save from
/// a chat reply must not run between those steps of a scan's save.
fn save_lock() -> &'static tokio::sync::Mutex<()> {
    static LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

/// Applies results to a model's rows, in one transaction, under `plan_write`. `Some` is an incoming
/// record and `None` means nothing was found. Keys not in `updates` are left as they were.
pub async fn save(
    db: &DatabaseConnection,
    model_id: &str,
    updates: Vec<(CapabilityKey, Option<CapabilityRecord>)>,
) -> Result<(), String> {
    if model_id.trim().is_empty() {
        return Err("model id is empty".to_owned());
    }

    let _guard = save_lock().lock().await;
    let txn = db.begin().await.map_err(|e| e.to_string())?;
    let rows = model_capability_value::Entity::find()
        .filter(model_capability_value::Column::ModelId.eq(model_id))
        .all(&txn)
        .await
        .map_err(|e| e.to_string())?;
    let existing = records_from_rows(rows, model_id);

    let now = chrono::Utc::now().timestamp_millis();
    let mut upserts = Vec::new();
    let mut removed = Vec::new();
    for (key, incoming) in updates {
        match plan_write(existing.get(&key), incoming) {
            Write::Upsert(record) => upserts.push(model_capability_value::ActiveModel {
                model_id: Set(model_id.to_owned()),
                key: Set(key.name().to_owned()),
                value: Set(serde_json::to_string(&record).map_err(|e| e.to_string())?),
                updated_at: Set(now),
            }),
            Write::Remove => removed.push(key.name()),
            Write::Keep => {}
        }
    }

    if !removed.is_empty() {
        model_capability_value::Entity::delete_many()
            .filter(model_capability_value::Column::ModelId.eq(model_id))
            .filter(model_capability_value::Column::Key.is_in(removed))
            .exec(&txn)
            .await
            .map_err(|e| e.to_string())?;
    }

    if !upserts.is_empty() {
        model_capability_value::Entity::insert_many(upserts)
            .on_conflict(
                OnConflict::columns([
                    model_capability_value::Column::ModelId,
                    model_capability_value::Column::Key,
                ])
                .update_columns([
                    model_capability_value::Column::Value,
                    model_capability_value::Column::UpdatedAt,
                ])
                .to_owned(),
            )
            .exec(&txn)
            .await
            .map_err(|e| e.to_string())?;
    }

    txn.commit().await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::database::init_database;
    use sea_orm::ActiveModelTrait;
    use serde_json::json;

    /// Fresh database file in the temp dir, removed when the test ends.
    struct TempDb(std::path::PathBuf);

    impl TempDb {
        fn new(name: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            Self(std::env::temp_dir().join(format!(
                "localgenie-{name}-{}-{nanos}.db",
                std::process::id()
            )))
        }

        fn url(&self) -> String {
            format!("sqlite:{}?mode=rwc", self.0.display())
        }
    }

    impl Drop for TempDb {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    fn fingerprint(size: u64) -> Fingerprint {
        Fingerprint {
            size,
            mtime: 1_000,
            geniex: "v0.9.3".into(),
        }
    }

    fn record(status: CapabilityStatus, size: u64) -> CapabilityRecord {
        from_source(status, CapabilitySource::Probe, size)
    }

    fn from_source(
        status: CapabilityStatus,
        source: CapabilitySource,
        size: u64,
    ) -> CapabilityRecord {
        CapabilityRecord {
            status,
            detail: Some("seen".into()),
            probed_at: 5,
            fingerprint: fingerprint(size),
            source,
        }
    }

    fn confirmed() -> CapabilityRecord {
        record(CapabilityStatus::Works, 1)
    }

    #[test]
    fn keys_map_both_ways() {
        assert_eq!(CapabilityKey::from_name("seed"), Some(CapabilityKey::Seed));
        assert_eq!(CapabilityKey::Seed.name(), "seed");
        assert_eq!(CapabilityKey::from_name("nctx"), None);
        assert_eq!(CapabilityKey::ALL.len(), 14);
    }

    #[test]
    fn thinking_tool_calls_grammar_vision_and_audio_are_stored_last() {
        assert_eq!(
            CapabilityKey::from_name("thinking"),
            Some(CapabilityKey::Thinking)
        );
        assert_eq!(
            CapabilityKey::from_name("toolCalls"),
            Some(CapabilityKey::ToolCalls)
        );
        assert_eq!(
            CapabilityKey::from_name("grammarString"),
            Some(CapabilityKey::GrammarString)
        );
        assert_eq!(
            CapabilityKey::from_name("vision"),
            Some(CapabilityKey::Vision)
        );
        assert_eq!(
            CapabilityKey::from_name("audio"),
            Some(CapabilityKey::Audio)
        );
        assert_eq!(CapabilityKey::Vision.name(), "vision");
        assert_eq!(CapabilityKey::Audio.name(), "audio");
        let n = CapabilityKey::ALL.len();
        assert_eq!(CapabilityKey::ALL[n - 5], CapabilityKey::Thinking);
        assert_eq!(CapabilityKey::ALL[n - 4], CapabilityKey::ToolCalls);
        assert_eq!(CapabilityKey::ALL[n - 3], CapabilityKey::GrammarString);
        assert_eq!(CapabilityKey::ALL[n - 2], CapabilityKey::Vision);
        assert_eq!(CapabilityKey::ALL[n - 1], CapabilityKey::Audio);
    }

    #[test]
    fn record_json_has_the_documented_shape() {
        let value = serde_json::to_value(record(CapabilityStatus::Works, 10)).expect("json");
        assert_eq!(
            value,
            json!({
                "status": "works",
                "detail": "seen",
                "probedAt": 5,
                "fingerprint": { "size": 10, "mtime": 1000, "geniex": "v0.9.3" },
                "source": "probe"
            })
        );
    }

    #[test]
    fn source_is_written_and_read_back() {
        let saved = from_source(CapabilityStatus::Works, CapabilitySource::Conversation, 1);
        let value = serde_json::to_value(&saved).expect("json");
        assert_eq!(value["source"], "conversation");
        let back: CapabilityRecord = serde_json::from_value(value).expect("record");
        assert_eq!(back.source, CapabilitySource::Conversation);
        assert_eq!(back, saved);
    }

    #[test]
    fn a_row_without_source_reads_as_probe() {
        let old = json!({
            "status": "accepted",
            "detail": "HTTP 200.",
            "probedAt": 5,
            "fingerprint": { "size": 10, "mtime": 1000, "geniex": "v0.9.3" }
        });
        let record: CapabilityRecord = serde_json::from_value(old).expect("old row parses");
        assert_eq!(record.source, CapabilitySource::Probe);
    }

    #[test]
    fn a_probe_negative_does_not_overwrite_a_confirmed_works_row() {
        for status in [CapabilityStatus::Accepted, CapabilityStatus::Rejected] {
            let incoming = record(status, 2);
            assert_eq!(
                plan_write(Some(&confirmed()), Some(incoming)),
                Write::Keep,
                "{} must not replace works",
                status.as_str()
            );
        }
    }

    #[test]
    fn a_probe_that_finds_nothing_does_not_remove_a_confirmed_row() {
        assert_eq!(plan_write(Some(&confirmed()), None), Write::Keep);
    }

    #[test]
    fn a_template_skip_does_not_remove_a_confirmed_row() {
        let skip = from_source(CapabilityStatus::Accepted, CapabilitySource::Template, 1);
        assert_eq!(plan_write(Some(&confirmed()), Some(skip)), Write::Keep);
    }

    #[test]
    fn a_probe_works_refreshes_only_the_detail_and_probed_at() {
        let existing = from_source(CapabilityStatus::Works, CapabilitySource::Conversation, 1);
        let mut incoming = record(CapabilityStatus::Works, 9);
        incoming.detail = Some("new detail".into());
        incoming.probed_at = 99;
        match plan_write(Some(&existing), Some(incoming)) {
            Write::Upsert(updated) => {
                assert_eq!(updated.detail.as_deref(), Some("new detail"));
                assert_eq!(updated.probed_at, 99);
                assert_eq!(updated.source, CapabilitySource::Conversation);
                assert_eq!(updated.fingerprint, fingerprint(1));
                assert_eq!(updated.status, CapabilityStatus::Works);
            }
            other => panic!("expected an upsert, got {other:?}"),
        }
    }

    #[test]
    fn a_saved_reply_does_not_change_a_confirmed_row() {
        let existing = record(CapabilityStatus::Works, 1);
        let reply = from_source(CapabilityStatus::Works, CapabilitySource::Conversation, 1);
        assert_eq!(plan_write(Some(&existing), Some(reply)), Write::Keep);
    }

    #[test]
    fn a_conversation_positive_is_stored_when_no_row_exists() {
        let reply = from_source(CapabilityStatus::Works, CapabilitySource::Conversation, 1);
        assert_eq!(plan_write(None, Some(reply.clone())), Write::Upsert(reply));
    }

    #[test]
    fn an_unconfirmed_row_takes_the_incoming_record_or_is_removed() {
        let accepted = record(CapabilityStatus::Accepted, 1);
        let rejected = record(CapabilityStatus::Rejected, 2);
        assert_eq!(
            plan_write(Some(&accepted), Some(rejected.clone())),
            Write::Upsert(rejected)
        );
        assert_eq!(plan_write(Some(&accepted), None), Write::Remove);
        assert_eq!(plan_write(None, None), Write::Remove);
    }

    #[test]
    fn entry_is_stale_when_the_fingerprint_differs() {
        let rec = record(CapabilityStatus::Accepted, 10);
        assert!(!CapabilityEntry::new(CapabilityKey::Seed, &rec, &fingerprint(10)).stale);
        assert!(CapabilityEntry::new(CapabilityKey::Seed, &rec, &fingerprint(11)).stale);

        let mut newer_geniex = fingerprint(10);
        newer_geniex.geniex = "v0.9.4".into();
        assert!(CapabilityEntry::new(CapabilityKey::Seed, &rec, &newer_geniex).stale);
    }

    #[test]
    fn a_confirmed_row_is_not_stale_after_a_file_or_geniex_change() {
        let rec = confirmed();
        assert!(!CapabilityEntry::new(CapabilityKey::Seed, &rec, &fingerprint(11)).stale);
        let mut newer_geniex = fingerprint(1);
        newer_geniex.geniex = "v0.9.4".into();
        assert!(!CapabilityEntry::new(CapabilityKey::Seed, &rec, &newer_geniex).stale);
    }

    #[tokio::test]
    async fn save_then_load_round_trips_and_removes_dropped_keys() {
        let tmp = TempDb::new("capability-roundtrip");
        let db = init_database(&tmp.url()).await.expect("migrations apply");

        save(
            &db,
            "org/model",
            vec![
                (CapabilityKey::Seed, Some(confirmed())),
                (
                    CapabilityKey::TopK,
                    Some(record(CapabilityStatus::Accepted, 1)),
                ),
            ],
        )
        .await
        .expect("save");
        let loaded = load(&db, "org/model").await.expect("load");
        assert_eq!(loaded.len(), 2);
        assert_eq!(
            loaded.get(&CapabilityKey::Seed).map(|r| r.status),
            Some(CapabilityStatus::Works)
        );

        // A new run that rejects seed and does not reach top_k. Seed is confirmed, so it stays;
        // top_k is not confirmed and is removed.
        save(
            &db,
            "org/model",
            vec![
                (
                    CapabilityKey::Seed,
                    Some(record(CapabilityStatus::Rejected, 2)),
                ),
                (CapabilityKey::TopK, None),
            ],
        )
        .await
        .expect("save again");
        let loaded = load(&db, "org/model").await.expect("load again");
        assert_eq!(loaded.len(), 1);
        assert_eq!(
            loaded.get(&CapabilityKey::Seed).map(|r| r.status),
            Some(CapabilityStatus::Works)
        );
    }

    #[tokio::test]
    async fn a_negative_probe_through_save_keeps_a_confirmed_row() {
        let tmp = TempDb::new("capability-write-once");
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        save(
            &db,
            "org/model",
            vec![(CapabilityKey::Thinking, Some(confirmed()))],
        )
        .await
        .expect("save works");
        save(
            &db,
            "org/model",
            vec![(
                CapabilityKey::Thinking,
                Some(from_source(
                    CapabilityStatus::Accepted,
                    CapabilitySource::Template,
                    3,
                )),
            )],
        )
        .await
        .expect("template skip");
        save(&db, "org/model", vec![(CapabilityKey::Thinking, None)])
            .await
            .expect("empty probe");

        let loaded = load(&db, "org/model").await.expect("load");
        assert_eq!(loaded.get(&CapabilityKey::Thinking), Some(&confirmed()));
    }

    #[tokio::test]
    async fn a_conversation_source_is_stored_and_read_back_from_the_database() {
        let tmp = TempDb::new("capability-source");
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        let reply = from_source(CapabilityStatus::Works, CapabilitySource::Conversation, 1);
        save(
            &db,
            "org/model",
            vec![(CapabilityKey::Thinking, Some(reply.clone()))],
        )
        .await
        .expect("save");
        let loaded = load(&db, "org/model").await.expect("load");
        assert_eq!(loaded.get(&CapabilityKey::Thinking), Some(&reply));
    }

    #[tokio::test]
    async fn load_skips_unknown_keys_and_bad_values() {
        let tmp = TempDb::new("capability-skip");
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        save(
            &db,
            "org/model",
            vec![(CapabilityKey::Seed, Some(confirmed()))],
        )
        .await
        .expect("save");
        for (key, value) in [
            ("fromNewerVersion", "true"),
            ("topP", "{\"status\":\"maybe\"}"),
        ] {
            model_capability_value::ActiveModel {
                model_id: Set("org/model".to_owned()),
                key: Set(key.to_owned()),
                value: Set(value.to_owned()),
                updated_at: Set(1),
            }
            .insert(&db)
            .await
            .expect("insert bad row");
        }

        let loaded = load(&db, "org/model").await.expect("load");
        assert_eq!(loaded.len(), 1);
        assert!(loaded.contains_key(&CapabilityKey::Seed));
    }

    #[tokio::test]
    async fn a_row_saved_before_source_existed_loads_as_probe() {
        let tmp = TempDb::new("capability-old-row");
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        let old = json!({
            "status": "works",
            "detail": "old",
            "probedAt": 5,
            "fingerprint": { "size": 1, "mtime": 1000, "geniex": "v0.9.3" }
        });
        model_capability_value::ActiveModel {
            model_id: Set("org/model".to_owned()),
            key: Set("seed".to_owned()),
            value: Set(old.to_string()),
            updated_at: Set(1),
        }
        .insert(&db)
        .await
        .expect("insert old row");

        let loaded = load(&db, "org/model").await.expect("load");
        assert_eq!(
            loaded.get(&CapabilityKey::Seed).map(|r| r.source),
            Some(CapabilitySource::Probe)
        );
    }

    #[tokio::test]
    async fn empty_model_id_is_refused() {
        let tmp = TempDb::new("capability-empty");
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        assert!(save(&db, " ", vec![]).await.is_err());
    }
}

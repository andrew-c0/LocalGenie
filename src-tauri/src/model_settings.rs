//! Per-model settings, stored one row per key in `model_setting_values`.
//!
//! Every key is declared once in `setting_keys!` with the Rust type its value must have. Saves
//! are checked against that type before anything is written, so a new setting is one line here
//! and needs no migration.

use std::collections::HashMap;

use sea_orm::sea_query::OnConflict;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set, TransactionTrait};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::entities::model_setting_value;

macro_rules! setting_keys {
    ($($variant:ident => $name:literal : $ty:ty),* $(,)?) => {
        /// Every setting stored per model. The name is the database key and the key the frontend
        /// uses in its settings object.
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum SettingKey {
            $($variant),*
        }

        impl SettingKey {
            /// The key this setting is stored under.
            pub fn name(self) -> &'static str {
                match self {
                    $(SettingKey::$variant => $name),*
                }
            }

            /// The setting for a stored key, or None when this build does not know it.
            pub fn from_name(name: &str) -> Option<Self> {
                match name {
                    $($name => Some(SettingKey::$variant),)*
                    _ => None,
                }
            }

            /// Checks that `value` has the type this setting is declared with.
            pub fn validate(self, value: &Value) -> Result<(), String> {
                match self {
                    $(SettingKey::$variant => serde_json::from_value::<$ty>(value.clone())
                        .map(|_| ())
                        .map_err(|e| format!("{}: {e}", $name))),*
                }
            }
        }
    };
}

setting_keys! {
    Temperature => "temperature": f64,
    TopP => "topP": f64,
    TopK => "topK": i64,
    MinP => "minP": f64,
    RepetitionPenalty => "repetitionPenalty": f64,
    PresencePenalty => "presencePenalty": f64,
    FrequencyPenalty => "frequencyPenalty": f64,
    MaxTokens => "maxTokens": i64,
    Seed => "seed": i64,
    Think => "think": bool,
    GrammarString => "grammarString": String,
    SystemBlocks => "systemBlocks": Vec<SystemBlock>,
    Nctx => "nctx": i64,
    Ngl => "ngl": i64,
    Compute => "compute": String,
    PowerMode => "powerMode": String,
    SpecType => "specType": String,
    SpecDraftModel => "specDraftModel": String,
    SpecNMax => "specNMax": i64,
    SpecNMin => "specNMin": i64,
    SpecPMin => "specPMin": f64,
}

/// One part of a system prompt, as the editor stores it. Mirrors `SystemPromptBlock` in the
/// frontend's types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SystemBlock {
    Text { id: String, text: String },
    Datetime { id: String },
    Platform { id: String },
    File {
        id: String,
        path: String,
        name: String,
        size: Option<u64>,
    },
}

/// Settings saved for a model. Rows whose key is unknown, or whose value no longer matches its
/// type, are skipped, so one bad row does not stop the model's other settings from loading.
pub async fn load(
    db: &DatabaseConnection,
    model_id: &str,
) -> Result<HashMap<String, Value>, String> {
    let rows = model_setting_value::Entity::find()
        .filter(model_setting_value::Column::ModelId.eq(model_id))
        .all(db)
        .await
        .map_err(|e| e.to_string())?;

    let mut values = HashMap::new();
    for row in rows {
        let Some(key) = SettingKey::from_name(&row.key) else {
            continue;
        };
        let value: Value = match serde_json::from_str(&row.value) {
            Ok(value) => value,
            Err(e) => {
                eprintln!("[model_settings] skipping {} for {model_id}: {e}", row.key);
                continue;
            }
        };
        if let Err(e) = key.validate(&value) {
            eprintln!("[model_settings] skipping {model_id}: {e}");
            continue;
        }
        values.insert(key.name().to_owned(), value);
    }
    Ok(values)
}

/// Makes the stored settings for a model match `settings`: each key is upserted and any stored
/// key missing from `settings` is removed. Every value is checked first, so an invalid one writes
/// nothing.
pub async fn save(
    db: &DatabaseConnection,
    model_id: &str,
    settings: HashMap<String, Value>,
) -> Result<(), String> {
    if model_id.trim().is_empty() {
        return Err("model id is empty".to_owned());
    }

    let now = chrono::Utc::now().timestamp_millis();
    let mut names = Vec::with_capacity(settings.len());
    let mut rows = Vec::with_capacity(settings.len());
    for (name, value) in &settings {
        let key = SettingKey::from_name(name).ok_or_else(|| format!("unknown setting: {name}"))?;
        key.validate(value)?;
        names.push(key.name());
        rows.push(model_setting_value::ActiveModel {
            model_id: Set(model_id.to_owned()),
            key: Set(key.name().to_owned()),
            value: Set(serde_json::to_string(value).map_err(|e| e.to_string())?),
            updated_at: Set(now),
        });
    }

    let txn = db.begin().await.map_err(|e| e.to_string())?;

    let mut remove = model_setting_value::Entity::delete_many()
        .filter(model_setting_value::Column::ModelId.eq(model_id));
    if !names.is_empty() {
        remove = remove.filter(model_setting_value::Column::Key.is_not_in(names));
    }
    remove.exec(&txn).await.map_err(|e| e.to_string())?;

    if !rows.is_empty() {
        model_setting_value::Entity::insert_many(rows)
            .on_conflict(
                OnConflict::columns([
                    model_setting_value::Column::ModelId,
                    model_setting_value::Column::Key,
                ])
                .update_columns([
                    model_setting_value::Column::Value,
                    model_setting_value::Column::UpdatedAt,
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

    #[test]
    fn accepts_a_value_of_the_declared_type() {
        assert!(SettingKey::Temperature.validate(&json!(0.7)).is_ok());
        assert!(SettingKey::Nctx.validate(&json!(4096)).is_ok());
        assert!(SettingKey::Think.validate(&json!(false)).is_ok());
        assert!(SettingKey::Compute.validate(&json!("npu")).is_ok());
    }

    #[test]
    fn rejects_a_value_of_the_wrong_type() {
        assert!(SettingKey::Temperature.validate(&json!("hot")).is_err());
        assert!(SettingKey::Nctx.validate(&json!(4096.5)).is_err());
        assert!(SettingKey::Think.validate(&json!("yes")).is_err());
    }

    #[test]
    fn validates_compound_values_by_shape() {
        let blocks = json!([
            { "id": "1", "kind": "text", "text": "Hi" },
            { "id": "2", "kind": "datetime" },
            { "id": "3", "kind": "file", "path": "C:/a.md", "name": "a.md", "size": 12 }
        ]);
        assert!(SettingKey::SystemBlocks.validate(&blocks).is_ok());
        assert!(SettingKey::SystemBlocks
            .validate(&json!([{ "id": "1", "kind": "nope" }]))
            .is_err());
    }

    #[test]
    fn unknown_names_are_not_keys() {
        assert_eq!(SettingKey::from_name("temperature"), Some(SettingKey::Temperature));
        assert_eq!(SettingKey::from_name("origins"), None);
        assert_eq!(SettingKey::from_name("systemPrompt"), None);
    }

    #[tokio::test]
    async fn save_then_load_round_trips_and_removes_dropped_keys() {
        let tmp = TempDb::new("settings-roundtrip");
        let db = init_database(&tmp.url()).await.expect("migrations apply");

        let first = HashMap::from([
            ("temperature".to_owned(), json!(0.2)),
            ("compute".to_owned(), json!("gpu")),
        ]);
        save(&db, "org/model", first).await.expect("save");
        let loaded = load(&db, "org/model").await.expect("load");
        assert_eq!(loaded.get("temperature"), Some(&json!(0.2)));
        assert_eq!(loaded.get("compute"), Some(&json!("gpu")));

        let second = HashMap::from([("think".to_owned(), json!(false))]);
        save(&db, "org/model", second).await.expect("save again");
        let loaded = load(&db, "org/model").await.expect("load again");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded.get("think"), Some(&json!(false)));
    }

    #[tokio::test]
    async fn invalid_value_writes_nothing() {
        let tmp = TempDb::new("settings-invalid");
        let db = init_database(&tmp.url()).await.expect("migrations apply");

        let bad = HashMap::from([
            ("think".to_owned(), json!(true)),
            ("temperature".to_owned(), json!("hot")),
        ]);
        assert!(save(&db, "org/model", bad).await.is_err());
        assert!(load(&db, "org/model").await.expect("load").is_empty());
    }

    #[tokio::test]
    async fn load_skips_rows_with_unknown_keys() {
        let tmp = TempDb::new("settings-unknown");
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        save(
            &db,
            "org/model",
            HashMap::from([("seed".to_owned(), json!(7))]),
        )
        .await
        .expect("save");
        model_setting_value::ActiveModel {
            model_id: Set("org/model".to_owned()),
            key: Set("fromNewerVersion".to_owned()),
            value: Set("true".to_owned()),
            updated_at: Set(1),
        }
        .insert(&db)
        .await
        .expect("insert unknown row");

        let loaded = load(&db, "org/model").await.expect("load");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded.get("seed"), Some(&json!(7)));
    }
}

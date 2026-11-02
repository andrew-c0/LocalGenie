//! The RAM columns of a downloaded model's row: `base_ram_bytes`, `context_ram_bytes` and
//! `ram_approximate`. They are computed when the row is stored, when the model's saved context
//! changes, and by `backfill_model_ram` for rows that lack them. The model selector then only adds
//! them up instead of reading model files.

use std::collections::HashMap;
use std::path::Path;

use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use serde_json::Value;

use super::capabilities;
use super::model_ram::{self, StoredRam};
use crate::entities::downloaded_model;
use crate::model_settings;

/// The saved context window of a model: its `nctx` setting when that is a positive token count.
pub(super) fn saved_context(settings: &HashMap<String, Value>) -> Option<u64> {
    settings
        .get("nctx")
        .and_then(Value::as_i64)
        .and_then(|tokens| u64::try_from(tokens).ok())
        .filter(|tokens| *tokens > 0)
}

/// Recomputes and stores the RAM columns of `row`, reading its folder in the GenieX cache and its
/// saved context window.
async fn refresh_row(db: &DatabaseConnection, row: &downloaded_model::Model) -> Result<(), String> {
    let folder = capabilities::model_folder(&row.name)?;
    let requested = saved_context(&model_settings::load(db, &row.name).await?);
    store_ram(db, &row.name, &folder, row.precision.as_deref(), requested).await
}

/// Recomputes the RAM columns of the row named `name`. Nothing happens when there is no such row.
async fn refresh_by_name(db: &DatabaseConnection, name: &str) -> Result<(), String> {
    let row = downloaded_model::Entity::find_by_id(name)
        .one(db)
        .await
        .map_err(|e| e.to_string())?;
    match row {
        Some(row) => refresh_row(db, &row).await,
        None => Ok(()),
    }
}

/// `refresh_by_name` for a caller whose own write must still succeed. A failure is logged and the
/// columns keep their values (null after a store, so the backfill picks the row up again).
pub(super) async fn refresh_by_name_or_log(db: &DatabaseConnection, name: &str) {
    if let Err(e) = refresh_by_name(db, name).await {
        eprintln!("[ram] could not store the RAM estimate for {name}: {e}");
    }
}

/// Computes the RAM of the model whose files are in `folder` at `precision` and `requested` context,
/// then writes the three columns of the row `name`.
async fn store_ram(
    db: &DatabaseConnection,
    name: &str,
    folder: &Path,
    precision: Option<&str>,
    requested: Option<u64>,
) -> Result<(), String> {
    let folder = folder.to_path_buf();
    let precision = precision.unwrap_or_default().to_owned();
    let ram = tokio::task::spawn_blocking(move || {
        model_ram::stored_ram_for(&folder, &precision, requested)
    })
    .await
    .map_err(|e| format!("RAM estimate failed: {e}"))?;
    downloaded_model::Entity::update_many()
        .set(ram_columns(ram))
        .filter(downloaded_model::Column::Name.eq(name))
        .exec(db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// The three RAM columns holding `ram`. Every other column is left unchanged.
fn ram_columns(ram: StoredRam) -> downloaded_model::ActiveModel {
    downloaded_model::ActiveModel {
        base_ram_bytes: Set(Some(to_column(ram.base_bytes))),
        context_ram_bytes: Set(Some(to_column(ram.context_bytes))),
        ram_approximate: Set(Some(ram.approximate)),
        ..Default::default()
    }
}

/// A byte count as the signed column value. Model sizes are far below `i64::MAX`.
fn to_column(bytes: u64) -> i64 {
    i64::try_from(bytes).unwrap_or(i64::MAX)
}

/// The rows that have no RAM columns yet.
async fn rows_without_ram(db: &DatabaseConnection) -> Result<Vec<downloaded_model::Model>, String> {
    downloaded_model::Entity::find()
        .filter(downloaded_model::Column::BaseRamBytes.is_null())
        .all(db)
        .await
        .map_err(|e| e.to_string())
}

/// Fills the RAM columns of every downloaded model that lacks them. Rows that have them are left
/// alone, so this is safe to call at every startup. A model that fails is logged and stays null,
/// so the next call retries it.
#[tauri::command]
pub async fn backfill_model_ram(db: tauri::State<'_, DatabaseConnection>) -> Result<(), String> {
    for row in rows_without_ram(&db).await? {
        if let Err(e) = refresh_row(&db, &row).await {
            eprintln!(
                "[ram] could not fill the RAM estimate for {}: {e}",
                row.name
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::database::init_database;
    use crate::gguf::test_support::{build_header, kv_string, kv_u32};
    use sea_orm::ActiveModelTrait;
    use serde_json::json;

    const MIB: u64 = 1024 * 1024;

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

    /// A model folder under the temp dir with one GGUF of 2000 bytes: 2 layers, 256 bytes of KV per
    /// token, and no native context, so the default window is 4096 tokens.
    fn model_folder_with_gguf(tag: &str) -> std::path::PathBuf {
        let folder = std::env::temp_dir().join(format!("localgenie-ram-store-{tag}"));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("create temp model folder");
        let mut bytes = build_header(&[
            kv_string("general.architecture", "llama"),
            kv_u32("llama.block_count", 2),
            kv_u32("llama.embedding_length", 64),
            kv_u32("llama.attention.head_count", 4),
            kv_u32("llama.attention.head_count_kv", 2),
        ]);
        bytes.resize(2000, 0);
        std::fs::write(folder.join("model-Q4_0.gguf"), bytes).expect("write model file");
        folder
    }

    fn row(name: &str, base: Option<i64>) -> downloaded_model::ActiveModel {
        downloaded_model::ActiveModel {
            name: Set(name.into()),
            precision: Set(Some("Q4_0".into())),
            context_size: Set(None),
            param_count: Set(None),
            created_at: Set(1),
            updated_at: Set(1),
            repo_url: Set(None),
            model_card: Set(None),
            facets: Set(None),
            base_ram_bytes: Set(base),
            context_ram_bytes: Set(None),
            ram_approximate: Set(None),
        }
    }

    async fn stored(db: &DatabaseConnection, name: &str) -> downloaded_model::Model {
        downloaded_model::Entity::find_by_id(name)
            .one(db)
            .await
            .expect("query")
            .expect("row exists")
    }

    fn settings(pairs: &[(&str, Value)]) -> HashMap<String, Value> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_owned(), v.clone()))
            .collect()
    }

    #[test]
    fn saved_context_is_a_positive_nctx_only() {
        assert_eq!(
            saved_context(&settings(&[("nctx", json!(4096))])),
            Some(4096)
        );
        assert_eq!(saved_context(&settings(&[("nctx", json!(0))])), None);
        assert_eq!(saved_context(&settings(&[("nctx", json!(-8))])), None);
        assert_eq!(saved_context(&settings(&[("nctx", json!("4096"))])), None);
        assert_eq!(saved_context(&settings(&[("think", json!(true))])), None);
        assert_eq!(saved_context(&HashMap::new()), None);
    }

    #[test]
    fn ram_columns_hold_the_stored_values() {
        let got = ram_columns(StoredRam {
            base_bytes: 10,
            context_bytes: 20,
            approximate: true,
        });
        assert_eq!(got.base_ram_bytes, Set(Some(10)));
        assert_eq!(got.context_ram_bytes, Set(Some(20)));
        assert_eq!(got.ram_approximate, Set(Some(true)));
    }

    #[tokio::test]
    async fn store_ram_follows_the_saved_context_window() {
        let tmp = TempDb::new("ram-store-window");
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        row("org/ram", None).insert(&db).await.expect("insert row");
        let folder = model_folder_with_gguf("window");

        store_ram(&db, "org/ram", &folder, Some("Q4_0"), None)
            .await
            .expect("store at the default window");
        let got = stored(&db, "org/ram").await;
        assert_eq!(got.base_ram_bytes, Some((2000 + 256 * MIB) as i64));
        assert_eq!(got.context_ram_bytes, Some(256 * 4096));
        assert_eq!(got.ram_approximate, Some(false));

        // Saving nctx, then reading it back the way the settings save does, changes only the context.
        model_settings::save(&db, "org/ram", settings(&[("nctx", json!(1000))]))
            .await
            .expect("save context");
        let requested = saved_context(&model_settings::load(&db, "org/ram").await.expect("load"));
        store_ram(&db, "org/ram", &folder, Some("Q4_0"), requested)
            .await
            .expect("store at the saved window");
        let got = stored(&db, "org/ram").await;
        assert_eq!(got.context_ram_bytes, Some(256 * 1000));
        assert_eq!(got.base_ram_bytes, Some((2000 + 256 * MIB) as i64));

        // A reset clears the saved context, so the default window comes back.
        model_settings::save(&db, "org/ram", HashMap::new())
            .await
            .expect("reset settings");
        let requested = saved_context(&model_settings::load(&db, "org/ram").await.expect("load"));
        store_ram(&db, "org/ram", &folder, Some("Q4_0"), requested)
            .await
            .expect("store after reset");
        assert_eq!(
            stored(&db, "org/ram").await.context_ram_bytes,
            Some(256 * 4096)
        );

        let _ = std::fs::remove_dir_all(&folder);
    }

    #[tokio::test]
    async fn backfill_selects_only_rows_without_ram() {
        let tmp = TempDb::new("ram-store-backfill");
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        row("org/empty", None)
            .insert(&db)
            .await
            .expect("insert empty");
        row("org/filled", Some(5))
            .insert(&db)
            .await
            .expect("insert filled");

        let missing: Vec<String> = rows_without_ram(&db)
            .await
            .expect("query")
            .into_iter()
            .map(|r| r.name)
            .collect();
        assert_eq!(missing, vec!["org/empty".to_string()]);
    }
}

use sea_orm_migration::prelude::*;

mod m20260730_000001_create_tables;
mod m20261007_000001_downloaded_models;
mod m20261020_000001_add_repo_columns;
mod m20261022_000001_message_finish_and_errors;
mod m20261022_000002_message_stats;
mod m20261023_000001_model_setting_values;
mod m20261023_000002_model_capability_values;
mod m20261024_000001_message_attachments;
mod m20261025_000001_message_usage;
mod m20261026_000001_chat_session_pinned;
mod m20261027_000001_create_benchmark_tables;
mod m20261028_000001_benchmark_run_counters;
mod m20261028_000002_benchmark_prompt_text;
mod m20261029_000001_benchmark_run_power;
mod m20261030_000001_chat_session_overrides;
mod m20261031_000001_message_kind;
mod m20261032_000001_message_compute;
mod m20261033_000001_downloaded_model_facets;
pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260730_000001_create_tables::Migration),
            Box::new(m20261007_000001_downloaded_models::Migration),
            Box::new(m20261020_000001_add_repo_columns::Migration),
            Box::new(m20261022_000001_message_finish_and_errors::Migration),
            Box::new(m20261022_000002_message_stats::Migration),
            Box::new(m20261023_000001_model_setting_values::Migration),
            Box::new(m20261023_000002_model_capability_values::Migration),
            Box::new(m20261024_000001_message_attachments::Migration),
            Box::new(m20261025_000001_message_usage::Migration),
            Box::new(m20261026_000001_chat_session_pinned::Migration),
            Box::new(m20261027_000001_create_benchmark_tables::Migration),
            Box::new(m20261028_000001_benchmark_run_counters::Migration),
            Box::new(m20261028_000002_benchmark_prompt_text::Migration),
            Box::new(m20261029_000001_benchmark_run_power::Migration),
            Box::new(m20261030_000001_chat_session_overrides::Migration),
            Box::new(m20261031_000001_message_kind::Migration),
            Box::new(m20261032_000001_message_compute::Migration),
            Box::new(m20261033_000001_downloaded_model_facets::Migration),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::Migrator;
    use crate::commands::database::init_database;
    use crate::entities::{chat_error, chat_session, message, model_setting_value};
    use sea_orm::{
        ActiveModelTrait, ConnectionTrait, DatabaseBackend, EntityTrait, Set, Statement,
    };
    use sea_orm_migration::MigratorTrait;

    /// Fresh database file in the temp dir, removed when the test ends.
    struct TempDb(std::path::PathBuf);

    impl TempDb {
        fn new(name: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let path = std::env::temp_dir().join(format!(
                "localgenie-{name}-{}-{nanos}.db",
                std::process::id()
            ));
            Self(path)
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

    #[tokio::test]
    async fn new_migration_adds_finish_reason_and_chat_errors() {
        let tmp = TempDb::new("migrate-up");
        let db = init_database(&tmp.url()).await.expect("migrations apply");

        chat_session::ActiveModel {
            id: Set("s1".into()),
            title: Set("t".into()),
            model_id: Set(None),
            context_chars: Set(0),
            created_at: Set(1),
            updated_at: Set(1),
            pinned: Set(false),
            settings_overrides: Set(None),
        }
        .insert(&db)
        .await
        .expect("insert session");

        message::ActiveModel {
            id: Set("m1".into()),
            session_id: Set("s1".into()),
            role: Set("assistant".into()),
            content: Set("hi".into()),
            model_id: Set(None),
            created_at: Set(2),
            finish_reason: Set(Some("length".into())),
            ..Default::default()
        }
        .insert(&db)
        .await
        .expect("insert message with finish_reason");

        chat_error::ActiveModel {
            id: Set("e1".into()),
            session_id: Set("s1".into()),
            message_id: Set(None),
            error: Set("boom".into()),
            created_at: Set(3),
        }
        .insert(&db)
        .await
        .expect("insert chat error without reply");

        let msg = message::Entity::find_by_id("m1")
            .one(&db)
            .await
            .expect("query")
            .expect("row exists");
        assert_eq!(msg.finish_reason.as_deref(), Some("length"));

        let err = chat_error::Entity::find_by_id("e1")
            .one(&db)
            .await
            .expect("query")
            .expect("row exists");
        assert_eq!(err.message_id, None);
        assert_eq!(err.error, "boom");
    }

    #[tokio::test]
    async fn message_stats_migration_adds_and_drops_columns() {
        let tmp = TempDb::new("migrate-stats");
        let db = init_database(&tmp.url()).await.expect("migrations apply");

        let columns = |db: sea_orm::DatabaseConnection| async move {
            let rows = db
                .query_all(sea_orm::Statement::from_string(
                    sea_orm::DatabaseBackend::Sqlite,
                    "PRAGMA table_info(messages)".to_owned(),
                ))
                .await
                .expect("table_info");
            rows.iter()
                .map(|r| r.try_get::<String>("", "name").expect("name"))
                .collect::<Vec<_>>()
        };
        let stat_cols = [
            "time_to_first_token_ms",
            "total_time_ms",
            "token_count",
            "prompt_chars",
        ];
        let before = columns(db.clone()).await;
        for col in stat_cols {
            assert!(before.iter().any(|c| c == col), "{col} missing after up");
        }

        chat_session::ActiveModel {
            id: Set("s1".into()),
            title: Set("t".into()),
            model_id: Set(None),
            context_chars: Set(0),
            created_at: Set(1),
            updated_at: Set(1),
            pinned: Set(false),
            settings_overrides: Set(None),
        }
        .insert(&db)
        .await
        .expect("insert session");

        message::ActiveModel {
            id: Set("m1".into()),
            session_id: Set("s1".into()),
            role: Set("assistant".into()),
            content: Set("hi".into()),
            model_id: Set(None),
            created_at: Set(2),
            finish_reason: Set(None),
            time_to_first_token_ms: Set(Some(120)),
            total_time_ms: Set(Some(900)),
            token_count: Set(Some(42)),
            prompt_chars: Set(Some(7)),
            attachments: Set(None),
            prompt_tokens: Set(None),
            completion_tokens: Set(None),
            kind: Set("text".into()),
            system_type: Set(None),
            compute: Set(None),
        }
        .insert(&db)
        .await
        .expect("insert message with stats");

        let msg = message::Entity::find_by_id("m1")
            .one(&db)
            .await
            .expect("query")
            .expect("row exists");
        assert_eq!(msg.time_to_first_token_ms, Some(120));
        assert_eq!(msg.total_time_ms, Some(900));
        assert_eq!(msg.token_count, Some(42));
        assert_eq!(msg.prompt_chars, Some(7));

        // Fourteen steps: the model settings, capability, attachment, usage, pinned, benchmark, counter, text, power, chat overrides, message kind, message compute and downloaded model facets migrations come after this one.
        Migrator::down(&db, Some(14))
            .await
            .expect("revert stats migration");
        let after_down = columns(db.clone()).await;
        for col in stat_cols {
            assert!(
                !after_down.iter().any(|c| c == col),
                "{col} left after down"
            );
        }
        assert!(after_down.iter().any(|c| c == "finish_reason"));

        Migrator::up(&db, None)
            .await
            .expect("reapply stats migration");
        let after_up = columns(db.clone()).await;
        for col in stat_cols {
            assert!(
                after_up.iter().any(|c| c == col),
                "{col} missing after reapply"
            );
        }
    }

    #[tokio::test]
    async fn model_settings_migration_splits_json_rows() {
        let tmp = TempDb::new("migrate-settings");
        let db = init_database(&tmp.url()).await.expect("migrations apply");

        // Put back the old JSON row, then apply the migrations again so it copies it.
        // Thirteen steps: the capability, attachment, usage, pinned, benchmark, counter, text, power, chat overrides, message kind, message compute and downloaded model facets migrations come after the settings one.
        Migrator::down(&db, Some(13))
            .await
            .expect("revert settings migration");
        db.execute(Statement::from_string(
            DatabaseBackend::Sqlite,
            r#"INSERT INTO model_settings (model_id, settings, updated_at) VALUES ('org/model',
            '{"temperature":0.2,"think":false,"compute":"npu","nctx":4096,"systemPrompt":"Be brief.",
              "origins":"*","keepalive":300,"seed":null}', 5)"#
                .to_owned(),
        ))
        .await
        .expect("insert legacy row");
        Migrator::up(&db, None)
            .await
            .expect("reapply settings migration");

        let rows = model_setting_value::Entity::find()
            .all(&db)
            .await
            .expect("query");
        let stored: std::collections::HashMap<String, String> =
            rows.into_iter().map(|r| (r.key, r.value)).collect();

        assert_eq!(stored.get("temperature").map(String::as_str), Some("0.2"));
        assert_eq!(stored.get("think").map(String::as_str), Some("false"));
        assert_eq!(stored.get("compute").map(String::as_str), Some("\"npu\""));
        assert_eq!(stored.get("nctx").map(String::as_str), Some("4096"));
        assert!(!stored.contains_key("seed"), "null values are not copied");
        assert!(!stored.contains_key("origins"));
        assert!(!stored.contains_key("keepalive"));
        assert!(!stored.contains_key("systemPrompt"));

        let blocks: serde_json::Value =
            serde_json::from_str(&stored["systemBlocks"]).expect("blocks are JSON");
        assert_eq!(
            blocks,
            serde_json::json!([{ "id": "legacy-text", "kind": "text", "text": "Be brief." }])
        );
    }

    #[tokio::test]
    async fn capability_values_store_one_row_per_key() {
        use crate::entities::model_capability_value;

        let tmp = TempDb::new("migrate-capability");
        let db = init_database(&tmp.url()).await.expect("migrations apply");

        let row = |key: &str, value: &str| model_capability_value::ActiveModel {
            model_id: Set("org/model".into()),
            key: Set(key.into()),
            value: Set(value.into()),
            updated_at: Set(1),
        };
        row("seed", "{}").insert(&db).await.expect("insert seed");
        row("maxTokens", "{}")
            .insert(&db)
            .await
            .expect("insert maxTokens");
        assert!(
            row("seed", "{}").insert(&db).await.is_err(),
            "model_id and key are the primary key"
        );

        let rows = model_capability_value::Entity::find()
            .all(&db)
            .await
            .expect("query");
        assert_eq!(rows.len(), 2);
    }

    #[tokio::test]
    async fn attachments_are_stored_as_json_text() {
        let tmp = TempDb::new("migrate-attachments");
        let db = init_database(&tmp.url()).await.expect("migrations apply");

        chat_session::ActiveModel {
            id: Set("s1".into()),
            title: Set("t".into()),
            model_id: Set(None),
            context_chars: Set(0),
            created_at: Set(1),
            updated_at: Set(1),
            pinned: Set(false),
            settings_overrides: Set(None),
        }
        .insert(&db)
        .await
        .expect("insert session");

        let json = r#"[{"id":"a1","kind":"image","name":"dot.png","size":4}]"#;
        message::ActiveModel {
            id: Set("m1".into()),
            session_id: Set("s1".into()),
            role: Set("user".into()),
            content: Set("what is this?".into()),
            model_id: Set(None),
            created_at: Set(2),
            finish_reason: Set(None),
            time_to_first_token_ms: Set(None),
            total_time_ms: Set(None),
            token_count: Set(None),
            prompt_chars: Set(None),
            attachments: Set(Some(json.into())),
            prompt_tokens: Set(None),
            completion_tokens: Set(None),
            kind: Set("text".into()),
            system_type: Set(None),
            compute: Set(None),
        }
        .insert(&db)
        .await
        .expect("insert message with attachments");

        let msg = message::Entity::find_by_id("m1")
            .one(&db)
            .await
            .expect("query")
            .expect("row exists");
        assert_eq!(msg.attachments.as_deref(), Some(json));
    }

    #[tokio::test]
    async fn benchmark_tables_keep_history_and_block_prompt_in_use() {
        use crate::entities::{
            benchmark_file, benchmark_prompt, benchmark_prompt_file, benchmark_run,
            benchmark_run_step, benchmark_suite, benchmark_suite_step,
        };
        use sea_orm::{ActiveModelTrait, EntityTrait, Set};

        let tmp = TempDb::new("migrate-benchmark");
        let db = init_database(&tmp.url()).await.expect("migrations apply");

        benchmark_prompt::ActiveModel {
            id: Set("p1".into()),
            name: Set("Capital".into()),
            description: Set(None),
            text: Set("Capital of France?".into()),
            match_rule: Set("all".into()),
            run_count: Set(0),
            created_at: Set(1),
            updated_at: Set(1),
        }
        .insert(&db)
        .await
        .expect("insert prompt");

        benchmark_file::ActiveModel {
            id: Set("f1".into()),
            name: Set("notes.txt".into()),
            kind: Set("text".into()),
            size: Set(Some(4)),
            chars: Set(Some(4)),
            stored_path: Set("benchmark-files/f1/notes.txt".into()),
            sha256: Set("ab".into()),
            created_at: Set(1),
        }
        .insert(&db)
        .await
        .expect("insert file");

        benchmark_prompt_file::ActiveModel {
            prompt_id: Set("p1".into()),
            position: Set(0),
            file_id: Set("f1".into()),
        }
        .insert(&db)
        .await
        .expect("attach file to prompt");

        benchmark_suite::ActiveModel {
            id: Set("s1".into()),
            name: Set("Smoke".into()),
            description: Set(None),
            mode: Set("conversation".into()),
            warmup_runs: Set(1),
            repetitions: Set(2),
            run_count: Set(0),
            created_at: Set(1),
            updated_at: Set(1),
        }
        .insert(&db)
        .await
        .expect("insert suite");

        benchmark_suite_step::ActiveModel {
            id: Set("st1".into()),
            suite_id: Set("s1".into()),
            position: Set(0),
            prompt_id: Set("p1".into()),
        }
        .insert(&db)
        .await
        .expect("add step");

        benchmark_run::ActiveModel {
            id: Set("r1".into()),
            suite_id: Set(Some("s1".into())),
            suite_name: Set("Smoke".into()),
            model_name: Set("org/model".into()),
            model_key: Set("org/model".into()),
            compute: Set("npu".into()),
            mode: Set("conversation".into()),
            warmup_runs: Set(1),
            repetitions: Set(2),
            status: Set("completed".into()),
            started_at: Set(2),
            ..Default::default()
        }
        .insert(&db)
        .await
        .expect("insert run");

        benchmark_run_step::ActiveModel {
            id: Set("rs1".into()),
            run_id: Set("r1".into()),
            position: Set(0),
            repetition_index: Set(0),
            is_warmup: Set(true),
            prompt_name: Set("Capital".into()),
            prompt_text: Set("Capital of France?".into()),
            total_ms: Set(Some(900)),
            status: Set("completed".into()),
            ..Default::default()
        }
        .insert(&db)
        .await
        .expect("insert run step");

        // A prompt used by a suite step cannot be deleted.
        assert!(
            benchmark_prompt::Entity::delete_by_id("p1")
                .exec(&db)
                .await
                .is_err(),
            "prompt in use must not be deleted"
        );

        // Deleting the suite removes its steps, clears the run's suite link and keeps the run.
        benchmark_suite::Entity::delete_by_id("s1")
            .exec(&db)
            .await
            .expect("delete suite");
        assert!(benchmark_suite_step::Entity::find_by_id("st1")
            .one(&db)
            .await
            .expect("query")
            .is_none());
        let run = benchmark_run::Entity::find_by_id("r1")
            .one(&db)
            .await
            .expect("query")
            .expect("run kept");
        assert_eq!(run.suite_id, None);
        assert_eq!(run.suite_name, "Smoke");
        assert!(benchmark_run_step::Entity::find_by_id("rs1")
            .one(&db)
            .await
            .expect("query")
            .is_some());

        // With no suite using it, the prompt can go; its file link goes with it.
        benchmark_prompt::Entity::delete_by_id("p1")
            .exec(&db)
            .await
            .expect("delete unused prompt");
        assert!(benchmark_prompt_file::Entity::find()
            .all(&db)
            .await
            .expect("query")
            .is_empty());
        assert!(benchmark_file::Entity::find_by_id("f1")
            .one(&db)
            .await
            .expect("query")
            .is_some(), "the file row is removed by the app, not the database");
    }

    #[tokio::test]
    async fn downloaded_model_facets_round_trip() {
        use crate::entities::downloaded_model;

        let tmp = TempDb::new("migrate-facets");
        let db = init_database(&tmp.url()).await.expect("migrations apply");

        let columns = |db: sea_orm::DatabaseConnection| async move {
            let rows = db
                .query_all(sea_orm::Statement::from_string(
                    sea_orm::DatabaseBackend::Sqlite,
                    "PRAGMA table_info(downloaded_models)".to_owned(),
                ))
                .await
                .expect("table_info");
            rows.iter()
                .map(|r| r.try_get::<String>("", "name").expect("name"))
                .collect::<Vec<_>>()
        };
        assert!(columns(db.clone()).await.iter().any(|c| c == "facets"));

        let facets = r#"{"task":"text-generation","paramCount":7615616512,"paramCountApproximate":false,"baseRelation":"quantized","baseRepo":"Qwen/Qwen2.5-7B-Instruct","quantBits":[4]}"#;
        downloaded_model::ActiveModel {
            name: Set("org/model".into()),
            precision: Set(Some("Q4_K_M".into())),
            context_size: Set(Some(4096)),
            param_count: Set(None),
            created_at: Set(1),
            updated_at: Set(1),
            repo_url: Set(None),
            model_card: Set(None),
            facets: Set(Some(facets.into())),
        }
        .insert(&db)
        .await
        .expect("insert downloaded model");

        let row = downloaded_model::Entity::find_by_id("org/model")
            .one(&db)
            .await
            .expect("query")
            .expect("row exists");
        assert_eq!(row.facets.as_deref(), Some(facets));

        // Reverting drops the column; reapplying brings it back as null for old rows.
        Migrator::down(&db, Some(1)).await.expect("revert facets");
        assert!(!columns(db.clone()).await.iter().any(|c| c == "facets"));
        Migrator::up(&db, None).await.expect("reapply facets");
        let row = downloaded_model::Entity::find_by_id("org/model")
            .one(&db)
            .await
            .expect("query")
            .expect("row exists");
        assert_eq!(row.facets, None);
    }

    #[tokio::test]
    async fn new_migration_reverts_and_reapplies() {
        let tmp = TempDb::new("migrate-down");
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        Migrator::down(&db, Some(1))
            .await
            .expect("revert new migration");
        Migrator::up(&db, None)
            .await
            .expect("reapply new migration");
    }
}

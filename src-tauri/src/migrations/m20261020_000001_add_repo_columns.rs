use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Adds `repo_url` and `model_card` columns to `downloaded_models`.
///
/// The original table was created by an older build before this migration existed,
/// so `CREATE TABLE IF NOT EXISTS` in `m20261007_000001_downloaded_models` was a
/// no-op and never added these columns. This migration performs
/// `ALTER TABLE ... ADD COLUMN` for each column; errors (e.g. column already present
/// on an already-migrated database) are ignored so the migration is idempotent and
/// existing databases are not wiped.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        for col in ["repo_url", "model_card"] {
            let sql = format!("ALTER TABLE downloaded_models ADD COLUMN {col} TEXT");
            let _ = db.execute_unprepared(sql.as_str()).await;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        for col in ["model_card", "repo_url"] {
            let sql = format!("ALTER TABLE downloaded_models DROP COLUMN {col}");
            let _ = db.execute_unprepared(sql.as_str()).await;
        }
        Ok(())
    }
}

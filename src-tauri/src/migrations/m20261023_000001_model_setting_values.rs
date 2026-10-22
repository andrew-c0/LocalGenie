use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Keys that existed in the old per-model JSON. The list is fixed here on purpose: a migration
/// must not change when new settings are added later.
const COPIED_KEYS: &str = "'temperature', 'topP', 'topK', 'minP', 'repetitionPenalty', \
    'presencePenalty', 'frequencyPenalty', 'maxTokens', 'seed', 'think', 'grammarString', \
    'systemBlocks', 'nctx', 'ngl', 'compute', 'powerMode', 'specType', 'specDraftModel', \
    'specNMax', 'specNMin', 'specPMin'";

/// Splits each `model_settings` JSON object into one row per key. Strings are stored as JSON
/// text, so every value reads back the same way. Null values and the server keys that moved to
/// the app settings are left out.
fn copy_settings_sql() -> String {
    format!(
        r#"INSERT INTO model_setting_values (model_id, "key", value, updated_at)
SELECT m.model_id, j.key,
       CASE j.type
           WHEN 'text' THEN json_quote(j.value)
           WHEN 'true' THEN 'true'
           WHEN 'false' THEN 'false'
           WHEN 'integer' THEN CAST(j.value AS TEXT)
           WHEN 'real' THEN CAST(j.value AS TEXT)
           ELSE j.value
       END,
       m.updated_at
FROM model_settings AS m, json_each(m.settings) AS j
WHERE j.key IN ({COPIED_KEYS})
  AND j.type <> 'null'"#
    )
}

/// Turns a saved single-text `systemPrompt` into one text block, the same way the frontend does
/// when it loads an old row. Rows that already have blocks are left alone.
const COPY_LEGACY_PROMPT_SQL: &str = r#"INSERT INTO model_setting_values (model_id, "key", value, updated_at)
SELECT m.model_id, 'systemBlocks',
       json_array(json_object('id', 'legacy-text', 'kind', 'text',
                              'text', json_extract(m.settings, '$.systemPrompt'))),
       m.updated_at
FROM model_settings AS m
WHERE json_type(m.settings, '$.systemPrompt') = 'text'
  AND trim(json_extract(m.settings, '$.systemPrompt')) <> ''
  AND json_type(m.settings, '$.systemBlocks') IS NULL"#;

/// Replaces the one-blob-per-model table with one row per setting. The old `model_settings`
/// table is kept, unused, so the data stays recoverable; a later migration can drop it.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(ModelSettingValues::Table)
                    .col(ColumnDef::new(ModelSettingValues::ModelId).string().not_null())
                    .col(ColumnDef::new(ModelSettingValues::Key).string().not_null())
                    .col(ColumnDef::new(ModelSettingValues::Value).string().not_null())
                    .col(
                        ColumnDef::new(ModelSettingValues::UpdatedAt)
                            .big_integer()
                            .not_null(),
                    )
                    .primary_key(
                        Index::create()
                            .col(ModelSettingValues::ModelId)
                            .col(ModelSettingValues::Key),
                    )
                    .to_owned(),
            )
            .await?;

        let connection = manager.get_connection();
        connection.execute_unprepared(&copy_settings_sql()).await?;
        connection.execute_unprepared(COPY_LEGACY_PROMPT_SQL).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(ModelSettingValues::Table)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum ModelSettingValues {
    Table,
    ModelId,
    Key,
    Value,
    UpdatedAt,
}

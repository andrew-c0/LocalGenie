use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Per-conversation settings: a JSON object holding only the keys the chat overrides. Existing
/// conversations start with none, so they keep the model's settings.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(ChatSessions::Table)
                    .add_column(ColumnDef::new(ChatSessions::SettingsOverrides).text().null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(ChatSessions::Table)
                    .drop_column(ChatSessions::SettingsOverrides)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum ChatSessions {
    Table,
    SettingsOverrides,
}

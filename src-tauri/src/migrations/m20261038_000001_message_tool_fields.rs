use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Tool use in a chat. `tool_calls` holds the JSON array of the calls an assistant reply made.
/// `tool_record` holds the JSON of one tool message (`kind = "tool"`), whose result text is in
/// `content`. Both are null for every other row, and for rows saved before these columns.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // SQLite takes one column per ALTER TABLE, so each column is added on its own.
        manager
            .alter_table(
                Table::alter()
                    .table(Messages::Table)
                    .add_column(ColumnDef::new(Messages::ToolCalls).text().null())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Messages::Table)
                    .add_column(ColumnDef::new(Messages::ToolRecord).text().null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Messages::Table)
                    .drop_column(Messages::ToolRecord)
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Messages::Table)
                    .drop_column(Messages::ToolCalls)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum Messages {
    Table,
    ToolCalls,
    ToolRecord,
}

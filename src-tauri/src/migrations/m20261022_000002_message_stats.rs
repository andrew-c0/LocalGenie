use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Persists the generation stats shown under assistant replies, so they survive
/// leaving the chat and restarting the app. All columns are null for older rows.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for column in STAT_COLUMNS {
            manager
                .alter_table(
                    Table::alter()
                        .table(Messages::Table)
                        .add_column(ColumnDef::new(column).big_integer().null())
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for column in STAT_COLUMNS {
            manager
                .alter_table(
                    Table::alter()
                        .table(Messages::Table)
                        .drop_column(column)
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }
}

const STAT_COLUMNS: [Messages; 4] = [
    Messages::TimeToFirstTokenMs,
    Messages::TotalTimeMs,
    Messages::TokenCount,
    Messages::PromptChars,
];

#[derive(Iden, Clone, Copy)]
enum Messages {
    Table,
    TimeToFirstTokenMs,
    TotalTimeMs,
    TokenCount,
    PromptChars,
}

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// The text a prompt sends to the model. Existing prompts start with empty text and must be edited
/// before they can run.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(BenchmarkPrompts::Table)
                    .add_column(ColumnDef::new(PromptText::Text).string().not_null().default(""))
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(BenchmarkPrompts::Table)
                    .drop_column(PromptText::Text)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum BenchmarkPrompts {
    Table,
}

#[derive(Iden)]
enum PromptText {
    Text,
}

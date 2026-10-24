use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Keeps the exact token counts the server reports for an assistant reply: the prompt tokens for
/// the whole request, and the tokens generated. Null for older rows and for replies that were stopped.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for column in [Messages::PromptTokens, Messages::CompletionTokens] {
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
        for column in [Messages::PromptTokens, Messages::CompletionTokens] {
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

#[derive(Iden, Clone, Copy)]
enum Messages {
    Table,
    PromptTokens,
    CompletionTokens,
}

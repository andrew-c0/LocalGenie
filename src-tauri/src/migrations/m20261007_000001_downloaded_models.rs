use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Table keeping local metadata for downloaded models: the precision that
/// was actually pulled and the model's native context length, so the model
/// library card can show real values instead of defaults.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(DownloadedModels::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(DownloadedModels::Name)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(DownloadedModels::Precision).string())
                    .col(ColumnDef::new(DownloadedModels::ContextSize).big_integer())
                    .col(ColumnDef::new(DownloadedModels::ParamCount).big_integer())
                    .col(ColumnDef::new(DownloadedModels::CreatedAt).big_integer().not_null())
                    .col(ColumnDef::new(DownloadedModels::UpdatedAt).big_integer().not_null())
                    .col(ColumnDef::new(DownloadedModels::RepoUrl).string())
                    .col(ColumnDef::new(DownloadedModels::ModelCard).string())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(DownloadedModels::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum DownloadedModels {
    Table,
    Name,
    Precision,
    ContextSize,
    ParamCount,
    CreatedAt,
    UpdatedAt,
    RepoUrl,
    ModelCard,
}

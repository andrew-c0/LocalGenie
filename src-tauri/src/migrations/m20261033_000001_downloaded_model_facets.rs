use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// The Hugging Face facet summary of a downloaded model, as JSON text (task, parameters, library,
/// licence, base model, quantisation). Null for models downloaded before it was kept.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(DownloadedModels::Table)
                    .add_column(ColumnDef::new(DownloadedModels::Facets).text().null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(DownloadedModels::Table)
                    .drop_column(DownloadedModels::Facets)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum DownloadedModels {
    Table,
    Facets,
}

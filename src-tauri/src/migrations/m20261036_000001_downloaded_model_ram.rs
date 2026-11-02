use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// The RAM a downloaded model needs, stored on its row so the model selector only adds them up.
/// `base_ram_bytes` is the weights plus compute buffers and projector; `context_ram_bytes` is the KV
/// cache for the saved context window; `ram_approximate` is true when a flat factor stood in. All
/// are null until computed, which the backfill command and the metadata store do.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(DownloadedModels::Table)
                    .add_column(
                        ColumnDef::new(DownloadedModels::BaseRamBytes)
                            .big_integer()
                            .null(),
                    )
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(DownloadedModels::Table)
                    .add_column(
                        ColumnDef::new(DownloadedModels::ContextRamBytes)
                            .big_integer()
                            .null(),
                    )
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(DownloadedModels::Table)
                    .add_column(
                        ColumnDef::new(DownloadedModels::RamApproximate)
                            .boolean()
                            .null(),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for column in [
            DownloadedModels::BaseRamBytes,
            DownloadedModels::ContextRamBytes,
            DownloadedModels::RamApproximate,
        ] {
            manager
                .alter_table(
                    Table::alter()
                        .table(DownloadedModels::Table)
                        .drop_column(column)
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }
}

#[derive(Iden, Clone, Copy)]
enum DownloadedModels {
    Table,
    BaseRamBytes,
    ContextRamBytes,
    RamApproximate,
}

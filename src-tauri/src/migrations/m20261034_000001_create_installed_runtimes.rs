use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// One row per optional runtime, naming the version that is current. Older version folders stay on
/// disk; only this row changes when a new version is installed.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(InstalledRuntimes::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(InstalledRuntimes::RuntimeId)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(InstalledRuntimes::Version)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(InstalledRuntimes::InstallPath)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(InstalledRuntimes::SourceUrl)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(InstalledRuntimes::Sha256)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(InstalledRuntimes::Backend).string().null())
                    .col(
                        ColumnDef::new(InstalledRuntimes::InstalledAt)
                            .big_integer()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(InstalledRuntimes::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum InstalledRuntimes {
    Table,
    RuntimeId,
    Version,
    InstallPath,
    SourceUrl,
    Sha256,
    Backend,
    InstalledAt,
}

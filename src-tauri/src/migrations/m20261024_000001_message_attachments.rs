use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Keeps the attachments sent with a user message: a JSON array of `{ id, kind, name, size, path, chars }`.
/// The file contents are not stored, so a reload shows the names only. Null for older rows.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Messages::Table)
                    .add_column(ColumnDef::new(Messages::Attachments).text().null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Messages::Table)
                    .drop_column(Messages::Attachments)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum Messages {
    Table,
    Attachments,
}

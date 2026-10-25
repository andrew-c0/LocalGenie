use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Keeps a conversation pinned to the top of the chat list. Existing rows start unpinned.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(ChatSessions::Table)
                    .add_column(
                        ColumnDef::new(ChatSessions::Pinned)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(ChatSessions::Table)
                    .drop_column(ChatSessions::Pinned)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum ChatSessions {
    Table,
    Pinned,
}

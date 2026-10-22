use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Persists the server's `finish_reason` on assistant messages and adds the
/// `chat_errors` table, so chat errors survive a reload.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Messages::Table)
                    .add_column(ColumnDef::new(Messages::FinishReason).string().null())
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(ChatErrors::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ChatErrors::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(ChatErrors::SessionId).string().not_null())
                    .col(ColumnDef::new(ChatErrors::MessageId).string())
                    .col(ColumnDef::new(ChatErrors::Error).string().not_null())
                    .col(
                        ColumnDef::new(ChatErrors::CreatedAt)
                            .big_integer()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_chat_errors_session")
                            .from(ChatErrors::Table, ChatErrors::SessionId)
                            .to(ChatSessions::Table, ChatSessions::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_chat_errors_session")
                    .table(ChatErrors::Table)
                    .col(ChatErrors::SessionId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ChatErrors::Table).to_owned())
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Messages::Table)
                    .drop_column(Messages::FinishReason)
                    .to_owned(),
            )
            .await?;
        Ok(())
    }
}

#[derive(Iden)]
enum ChatSessions {
    Table,
    Id,
}

#[derive(Iden)]
enum Messages {
    Table,
    FinishReason,
}

#[derive(Iden)]
enum ChatErrors {
    Table,
    Id,
    SessionId,
    MessageId,
    Error,
    CreatedAt,
}

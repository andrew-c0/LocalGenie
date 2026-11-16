use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Dispatch (agent mode). A task is a chat session of kind `dispatch` plus one row here. `kind` is
/// `chat` for every existing session. `allowed_tools` and `limits` are JSON text; `notes` is the
/// agent's plan text; `report` and `error` are set when the task ends.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(ChatSessions::Table)
                    .add_column(
                        ColumnDef::new(ChatSessions::Kind)
                            .text()
                            .not_null()
                            .default("chat"),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(DispatchTasks::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(DispatchTasks::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(DispatchTasks::SessionId)
                            .string()
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(DispatchTasks::Goal).text().not_null())
                    .col(ColumnDef::new(DispatchTasks::Status).string().not_null())
                    .col(
                        ColumnDef::new(DispatchTasks::AllowedTools)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(DispatchTasks::Limits).text().not_null())
                    .col(
                        ColumnDef::new(DispatchTasks::Notes)
                            .text()
                            .not_null()
                            .default(""),
                    )
                    .col(ColumnDef::new(DispatchTasks::Report).text().null())
                    .col(ColumnDef::new(DispatchTasks::Error).text().null())
                    .col(
                        ColumnDef::new(DispatchTasks::Steps)
                            .big_integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(DispatchTasks::CreatedAt)
                            .big_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(DispatchTasks::StartedAt)
                            .big_integer()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(DispatchTasks::FinishedAt)
                            .big_integer()
                            .null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_dispatch_tasks_session")
                            .from(DispatchTasks::Table, DispatchTasks::SessionId)
                            .to(ChatSessions::Table, ChatSessions::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_dispatch_tasks_status")
                    .table(DispatchTasks::Table)
                    .col(DispatchTasks::Status)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("idx_dispatch_tasks_status")
                    .table(DispatchTasks::Table)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(DispatchTasks::Table).to_owned())
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(ChatSessions::Table)
                    .drop_column(ChatSessions::Kind)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum ChatSessions {
    Table,
    Id,
    Kind,
}

#[derive(Iden)]
enum DispatchTasks {
    Table,
    Id,
    SessionId,
    Goal,
    Status,
    AllowedTools,
    Limits,
    Notes,
    Report,
    Error,
    Steps,
    CreatedAt,
    StartedAt,
    FinishedAt,
}

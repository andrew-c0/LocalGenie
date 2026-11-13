use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// The MCP servers the user added (Settings > Tools). `args`, `env` and `headers` are JSON text.
/// `command` is set for a stdio server and `url` for an HTTP one.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(McpServer::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(McpServer::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(McpServer::Name).string().not_null())
                    .col(ColumnDef::new(McpServer::Transport).string().not_null())
                    .col(ColumnDef::new(McpServer::Command).string().null())
                    .col(ColumnDef::new(McpServer::Args).text().not_null())
                    .col(ColumnDef::new(McpServer::Env).text().not_null())
                    .col(ColumnDef::new(McpServer::Url).string().null())
                    .col(ColumnDef::new(McpServer::Headers).text().not_null())
                    .col(ColumnDef::new(McpServer::Enabled).boolean().not_null())
                    .col(
                        ColumnDef::new(McpServer::CreatedAt)
                            .big_integer()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(McpServer::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum McpServer {
    Table,
    Id,
    Name,
    Transport,
    Command,
    Args,
    Env,
    Url,
    Headers,
    Enabled,
    CreatedAt,
}

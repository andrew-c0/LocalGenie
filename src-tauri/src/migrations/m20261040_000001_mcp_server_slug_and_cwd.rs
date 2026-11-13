use sea_orm::{ConnectionTrait, Statement};
use sea_orm_migration::prelude::*;

use crate::commands::tools::mcp::backfill_slugs;

const SLUG_INDEX: &str = "idx_mcp_server_slug";

#[derive(DeriveMigrationName)]
pub struct Migration;

/// The slug and working folder of an MCP server. `slug` is the short name in its tool names. It is
/// filled for every existing row from the row's name, in creation order, with the rule a new server
/// follows, so the tool names of a server do not change. `cwd` is the working folder of a stdio
/// server; null runs it in the app's folder.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // SQLite takes one column per ALTER TABLE, so each column is added on its own.
        manager
            .alter_table(
                Table::alter()
                    .table(McpServer::Table)
                    .add_column(
                        ColumnDef::new(McpServer::Slug)
                            .string()
                            .not_null()
                            .default(""),
                    )
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(McpServer::Table)
                    .add_column(ColumnDef::new(McpServer::Cwd).string().null())
                    .to_owned(),
            )
            .await?;
        backfill_slugs_of_existing_rows(manager).await?;
        manager
            .create_index(
                Index::create()
                    .name(SLUG_INDEX)
                    .table(McpServer::Table)
                    .col(McpServer::Slug)
                    .unique()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // The index goes first: SQLite will not drop a column that an index still uses.
        manager
            .drop_index(
                Index::drop()
                    .name(SLUG_INDEX)
                    .table(McpServer::Table)
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(McpServer::Table)
                    .drop_column(McpServer::Cwd)
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(McpServer::Table)
                    .drop_column(McpServer::Slug)
                    .to_owned(),
            )
            .await
    }
}

/// Give every existing server the slug its name gives, servers taken in creation order.
async fn backfill_slugs_of_existing_rows(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    let connection = manager.get_connection();
    let backend = manager.get_database_backend();
    let rows = connection
        .query_all(Statement::from_string(
            backend,
            "SELECT id, name FROM mcp_server ORDER BY created_at, id".to_owned(),
        ))
        .await?;
    let mut servers = Vec::with_capacity(rows.len());
    for row in &rows {
        servers.push((
            row.try_get::<String>("", "id")?,
            row.try_get::<String>("", "name")?,
        ));
    }
    let slugs = backfill_slugs(servers.iter().map(|(_, name)| name.as_str()));
    for ((id, _), slug) in servers.iter().zip(slugs) {
        connection
            .execute(Statement::from_sql_and_values(
                backend,
                "UPDATE mcp_server SET slug = ? WHERE id = ?",
                [slug.into(), id.clone().into()],
            ))
            .await?;
    }
    Ok(())
}

#[derive(Iden)]
enum McpServer {
    Table,
    Slug,
    Cwd,
}

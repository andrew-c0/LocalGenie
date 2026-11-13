use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// One MCP server the user added (see `commands/tools/mcp`). `args`, `env` and `headers` are JSON text.
#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone)]
#[sea_orm(table_name = "mcp_server")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub name: String,
    /// `stdio` or `http`.
    pub transport: String,
    pub command: Option<String>,
    pub args: String,
    pub env: String,
    pub url: Option<String>,
    pub headers: String,
    /// Started when the app starts.
    pub enabled: bool,
    /// Unix epoch milliseconds.
    pub created_at: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

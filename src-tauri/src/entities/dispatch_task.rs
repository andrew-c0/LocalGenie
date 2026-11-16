use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// One Dispatch task (see `commands/dispatch`). Its messages live in the chat session it names.
/// `allowed_tools` and `limits` are JSON text. Timestamps are Unix epoch milliseconds.
#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone)]
#[sea_orm(table_name = "dispatch_tasks")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub session_id: String,
    pub goal: String,
    pub status: String,
    pub allowed_tools: String,
    pub limits: String,
    pub notes: String,
    pub report: Option<String>,
    pub error: Option<String>,
    pub steps: i64,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

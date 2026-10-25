use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// A file copied into the app data folder for benchmarking. `stored_path` is the copy,
/// not the original. A row is removed when no prompt or step references it.
#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone, PartialEq)]
#[sea_orm(table_name = "benchmark_files")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub name: String,
    /// `text`, `image` or `audio`.
    pub kind: String,
    pub size: Option<i64>,
    /// Character count for text files.
    pub chars: Option<i64>,
    pub stored_path: String,
    /// SHA-256 of the copied file, in lowercase hex.
    pub sha256: String,
    pub created_at: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// Snapshot of a file that was sent in a run step. There is no foreign key to
/// `benchmark_files`, so the record survives when the file is deleted.
#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone, PartialEq)]
#[sea_orm(table_name = "benchmark_run_step_files")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub run_step_id: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub position: i32,
    pub name: String,
    pub kind: String,
    pub size: Option<i64>,
    pub sha256: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

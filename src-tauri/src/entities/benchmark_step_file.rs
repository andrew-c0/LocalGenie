use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// A file added to one suite step, ordered by `position`.
#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone, PartialEq)]
#[sea_orm(table_name = "benchmark_step_files")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub step_id: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub position: i32,
    pub file_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// One step of a suite: a prompt, plus extra files in `benchmark_step_files`.
#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone, PartialEq)]
#[sea_orm(table_name = "benchmark_suite_steps")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub suite_id: String,
    pub position: i32,
    pub prompt_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

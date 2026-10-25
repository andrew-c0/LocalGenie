use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// One expected keyword of a prompt, ordered by `position`.
#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone, PartialEq)]
#[sea_orm(table_name = "benchmark_prompt_keywords")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub prompt_id: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub position: i32,
    pub keyword: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

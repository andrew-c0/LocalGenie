use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// A saved prompt in the benchmark library. Keywords and files live in their own tables.
#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone, PartialEq)]
#[sea_orm(table_name = "benchmark_prompts")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    /// The text sent to the model for this prompt.
    pub text: String,
    /// How expected keywords combine: `all` or `any`.
    pub match_rule: String,
    /// Runs since the prompt was last saved. Reset to zero on save.
    pub run_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

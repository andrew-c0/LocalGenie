use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// A suite (test run definition): ordered steps plus how to execute them.
#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone, PartialEq)]
#[sea_orm(table_name = "benchmark_suites")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    /// `conversation` (steps share history) or `independent` (fresh request per step).
    pub mode: String,
    /// Discarded passes of the whole suite before the timed repetitions.
    pub warmup_runs: i32,
    /// Timed passes of the whole suite.
    pub repetitions: i32,
    /// Runs since the suite was last saved. Reset to zero on save.
    pub run_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

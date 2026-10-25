use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// One execution of a suite. Settings and the machine are snapshots taken at start,
/// so the record stays valid after the suite or model changes. `suite_id` is cleared
/// when the suite is deleted; `suite_name` keeps the name.
#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone, PartialEq)]
#[sea_orm(table_name = "benchmark_runs")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub suite_id: Option<String>,
    pub suite_name: String,
    pub model_name: String,
    /// Shortened comparison key (see `shortModelKey` in the frontend).
    pub model_key: String,
    /// `npu`, `gpu` or `cpu`.
    pub compute: String,
    pub precision: Option<String>,
    pub nctx: Option<i64>,
    pub ngl: Option<i32>,
    pub power_mode: Option<String>,
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub seed: Option<i64>,
    pub max_tokens: Option<i64>,
    pub mode: String,
    pub warmup_runs: i32,
    pub repetitions: i32,
    pub geniex_version: Option<String>,
    pub chipset: Option<String>,
    pub total_memory_bytes: Option<i64>,
    /// Windows power plan name at the start of the run, for example `Balanced`.
    pub windows_power_plan: Option<String>,
    /// True when the machine was running on battery at the start of the run.
    pub on_battery: Option<bool>,
    /// `running`, `completed`, `failed` or `cancelled`.
    pub status: String,
    pub error: Option<String>,
    pub started_at: i64,
    pub finished_at: Option<i64>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

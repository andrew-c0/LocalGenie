use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// The result of one prompt within one pass of a run. Resource fields are summaries
/// over the step (no per-sample series).
#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone, PartialEq)]
#[sea_orm(table_name = "benchmark_run_steps")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub run_id: String,
    /// Order of the step within one pass.
    pub position: i32,
    /// Which pass this step belongs to; warmup passes are 0-based too and flagged by `is_warmup`.
    pub repetition_index: i32,
    pub is_warmup: bool,
    /// Prompt name and text as they were when the run started.
    pub prompt_name: String,
    pub prompt_text: String,
    pub output_text: Option<String>,
    pub ttft_ms: Option<f64>,
    pub total_ms: Option<i64>,
    pub tokens_per_sec: Option<f64>,
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub peak_model_memory_bytes: Option<i64>,
    pub avg_model_memory_bytes: Option<i64>,
    pub peak_memory_used_bytes: Option<i64>,
    pub avg_cpu: Option<f64>,
    pub avg_gpu: Option<f64>,
    pub avg_npu: Option<f64>,
    /// `None` when the prompt has no expected keywords.
    pub passed: Option<bool>,
    pub matched_keywords: Option<i32>,
    pub expected_keywords: Option<i32>,
    /// `completed`, `failed` or `skipped`.
    pub status: String,
    pub error: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// Metadata for a downloaded (cached) model shown on its library card.
#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone)]
#[sea_orm(table_name = "downloaded_models")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub name: String,
    /// Precision actually downloaded, e.g. `Q4_0` or `w4a16`.
    pub precision: Option<String>,
    /// Native context length reported by the model's config (tokens).
    pub context_size: Option<i64>,
    /// Total parameter count from HF safetensors metadata.
    pub param_count: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

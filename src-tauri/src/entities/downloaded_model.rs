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
    /// Repository URL on Hugging Face.
    pub repo_url: Option<String>,
    /// Full model card README content, stored for offline viewing.
    pub model_card: Option<String>,
    /// Hugging Face facet summary as JSON text (task, parameters, library, licence, base model,
    /// quantisation). Null when not kept.
    pub facets: Option<String>,
    /// RAM for the weights, compute buffers and vision projector, in bytes. Does not depend on the
    /// context window. Null until computed.
    pub base_ram_bytes: Option<i64>,
    /// RAM for the KV cache of the saved context window, in bytes. Zero for a QAIRT bundle. Null
    /// until computed.
    pub context_ram_bytes: Option<i64>,
    /// True when the RAM estimate used a flat factor or the model's files could not be measured.
    pub ram_approximate: Option<bool>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

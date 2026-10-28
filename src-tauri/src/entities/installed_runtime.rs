use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// The current installed version of one optional runtime (see `commands/runtimes`).
#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone)]
#[sea_orm(table_name = "installed_runtimes")]
pub struct Model {
    /// Runtime id, for example `sd-cpp`.
    #[sea_orm(primary_key, auto_increment = false)]
    pub runtime_id: String,
    pub version: String,
    /// Folder of the version: `<app data>/runtimes/<id>/<version>`.
    pub install_path: String,
    /// The GitHub release asset the version was installed from.
    pub source_url: String,
    /// SHA-256 (lower-case hex) of the archive as downloaded.
    pub sha256: String,
    /// Backend choice (CPU, GPU, NPU). Unused until a runtime offers one.
    pub backend: Option<String>,
    /// Unix epoch milliseconds.
    pub installed_at: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

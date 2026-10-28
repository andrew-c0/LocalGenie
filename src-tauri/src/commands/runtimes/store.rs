//! The `installed_runtimes` table: which version of each runtime is current.

use sea_orm::sea_query::OnConflict;
use sea_orm::{DatabaseConnection, EntityTrait, Set};

use super::install::InstalledVersion;
use crate::entities::installed_runtime;

/// The current install of a runtime, if any.
pub(super) async fn current_install(
    db: &DatabaseConnection,
    runtime_id: &str,
) -> Result<Option<installed_runtime::Model>, String> {
    installed_runtime::Entity::find_by_id(runtime_id)
        .one(db)
        .await
        .map_err(|e| e.to_string())
}

/// Record `installed` as the current version of `runtime_id`, replacing the previous row.
pub(super) async fn set_current(
    db: &DatabaseConnection,
    runtime_id: &str,
    installed: &InstalledVersion,
) -> Result<(), String> {
    let row = installed_runtime::ActiveModel {
        runtime_id: Set(runtime_id.to_string()),
        version: Set(installed.version.clone()),
        install_path: Set(installed.install_dir.to_string_lossy().into_owned()),
        source_url: Set(installed.source_url.clone()),
        sha256: Set(installed.sha256.clone()),
        backend: Set(None),
        installed_at: Set(now_millis()),
    };
    installed_runtime::Entity::insert(row)
        .on_conflict(
            OnConflict::column(installed_runtime::Column::RuntimeId)
                .update_columns([
                    installed_runtime::Column::Version,
                    installed_runtime::Column::InstallPath,
                    installed_runtime::Column::SourceUrl,
                    installed_runtime::Column::Sha256,
                    installed_runtime::Column::Backend,
                    installed_runtime::Column::InstalledAt,
                ])
                .to_owned(),
        )
        .exec(db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Forget the install of a runtime (its files are removed separately).
pub(super) async fn forget(db: &DatabaseConnection, runtime_id: &str) -> Result<(), String> {
    installed_runtime::Entity::delete_by_id(runtime_id)
        .exec(db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

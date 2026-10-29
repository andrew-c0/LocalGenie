//! Optional runtimes (for example stable-diffusion.cpp): list, update check, install and uninstall.
//! Archives come from each runtime's GitHub release. Versions live side by side under
//! `<app data>/runtimes/<id>/<version>/`; the `installed_runtimes` row names the current one.

pub(crate) mod archive;
pub mod release;
pub(crate) mod sherpa_cli;

mod install;
mod spec;
mod store;

#[cfg(test)]
pub(crate) mod test_support;

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use sea_orm::DatabaseConnection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use super::download::DownloadRegistry;
use install::{
    install_release, remove_runtime_files, validate_version, InstallProgress, InstallStage,
    InstalledVersion,
};
use release::{
    fetch_release_json, is_update, release_api_url, release_list_api_url, Release, ReleaseCache,
};
use spec::{find_spec, RuntimeSpec, RUNTIME_SPECS};

pub(crate) use spec::SD_CPP;

/// Event carrying `InstallProgress` while a runtime installs.
const INSTALL_PROGRESS_EVENT: &str = "runtime-install-progress";
/// Folder under the app data dir that holds every runtime.
const RUNTIMES_DIR: &str = "runtimes";

/// One runtime for the Settings list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub id: String,
    pub display_name: String,
    pub repo: String,
    pub installed_version: Option<String>,
    pub install_path: Option<String>,
}

/// Installed version against the latest release of a runtime.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeUpdateInfo {
    pub id: String,
    pub installed_version: Option<String>,
    pub latest_version: String,
    /// False when nothing is installed: the UI offers an install instead.
    pub update_available: bool,
    pub release_url: String,
}

/// The version folder of the current install of `spec`, or None when it is not installed. The
/// folder is not checked to exist; the caller does that.
pub(crate) async fn current_install_dir(
    db: &DatabaseConnection,
    spec: &RuntimeSpec,
) -> Result<Option<PathBuf>, String> {
    Ok(store::current_install(db, spec.id)
        .await?
        .map(|row| PathBuf::from(row.install_path)))
}

/// Path of the program in the current install of `spec`, or None when it is not installed. The
/// program is not checked to exist; the caller does that.
pub(crate) async fn current_program(
    db: &DatabaseConnection,
    spec: &RuntimeSpec,
) -> Result<Option<PathBuf>, String> {
    Ok(current_install_dir(db, spec)
        .await?
        .map(|dir| spec.exe_path(&dir)))
}

/// Every known runtime with its installed version, if any.
#[tauri::command]
pub async fn runtime_list(db: State<'_, DatabaseConnection>) -> Result<Vec<RuntimeInfo>, String> {
    let mut infos = Vec::with_capacity(RUNTIME_SPECS.len());
    for spec in RUNTIME_SPECS {
        let row = store::current_install(&db, spec.id).await?;
        infos.push(RuntimeInfo {
            id: spec.id.to_string(),
            display_name: spec.display_name.to_string(),
            repo: spec.repo.to_string(),
            installed_version: row.as_ref().map(|r| r.version.clone()),
            install_path: row.map(|r| r.install_path),
        });
    }
    Ok(infos)
}

/// Compare the installed version with the newest release that has a build for this platform
/// (cached for an hour).
#[tauri::command]
pub async fn runtime_check_update(
    id: String,
    db: State<'_, DatabaseConnection>,
    cache: State<'_, ReleaseCache>,
) -> Result<RuntimeUpdateInfo, String> {
    let spec = find_spec(&id)?;
    let installed = store::current_install(&db, spec.id)
        .await?
        .map(|row| row.version);
    let latest = latest_matching_release(&cache, spec).await?;
    Ok(RuntimeUpdateInfo {
        id: spec.id.to_string(),
        update_available: installed
            .as_deref()
            .is_some_and(|version| is_update(version, &latest.tag)),
        installed_version: installed,
        latest_version: latest.tag,
        release_url: latest.page_url,
    })
}

/// Install a runtime's release (the latest when `version` is not given). Returns the installed
/// version. Emits `runtime-install-progress` at each stage and once more on failure.
#[tauri::command]
pub async fn runtime_install(
    app: AppHandle,
    registry: State<'_, DownloadRegistry>,
    cache: State<'_, ReleaseCache>,
    db: State<'_, DatabaseConnection>,
    id: String,
    version: Option<String>,
) -> Result<String, String> {
    let spec = find_spec(&id)?;
    if let Some(version) = &version {
        validate_version(version)?;
    }
    let cancel = begin_operation(&registry, spec)?;

    let outcome = install_flow(
        &app,
        &registry,
        &cache,
        &db,
        spec,
        version.as_deref(),
        &cancel,
    )
    .await;
    registry.release(&operation_key(spec));
    match outcome {
        Ok(installed) => {
            emit_progress(
                &app,
                &stage_event(
                    spec,
                    InstallStage::Done,
                    &format!("Installed {}", installed.version),
                ),
            );
            Ok(installed.version)
        }
        Err(message) => {
            emit_progress(&app, &stage_event(spec, InstallStage::Error, &message));
            Err(message)
        }
    }
}

/// Remove every installed version of a runtime and its row. Refused while it is installing.
#[tauri::command]
pub async fn runtime_uninstall(
    registry: State<'_, DownloadRegistry>,
    db: State<'_, DatabaseConnection>,
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    let spec = find_spec(&id)?;
    begin_operation(&registry, spec)?;
    let outcome = uninstall_flow(&app, &db, spec).await;
    registry.release(&operation_key(spec));
    outcome
}

async fn install_flow(
    app: &AppHandle,
    registry: &DownloadRegistry,
    cache: &ReleaseCache,
    db: &DatabaseConnection,
    spec: &RuntimeSpec,
    version: Option<&str>,
    cancel: &AtomicBool,
) -> Result<InstalledVersion, String> {
    let report = |event: InstallProgress| emit_progress(app, &event);
    report(stage_event(
        spec,
        InstallStage::Checking,
        "Looking up the release",
    ));

    let release = match version {
        Some(version) => {
            let api_url = release_api_url(spec.repo, Some(&spec.git_tag(version)));
            cache.get_or_fetch(&api_url, spec.repo).await?
        }
        None => latest_matching_release(cache, spec).await?,
    };
    let root = runtimes_root(app)?;
    let installed =
        install_release(registry.client(), cancel, &root, spec, &release, &report).await?;
    store::set_current(db, spec.id, &installed).await?;
    Ok(installed)
}

/// The newest release of the runtime's repo with an archive for this platform. The release list
/// is read once and the choice is cached per repo and runtime. Failures are not cached.
async fn latest_matching_release(
    cache: &ReleaseCache,
    spec: &RuntimeSpec,
) -> Result<Release, String> {
    let key = format!("latest:{}:{}", spec.repo, spec.id);
    let list_url = release_list_api_url(spec.repo);
    cache
        .get_or_load(&key, || async move {
            let json = fetch_release_json(&list_url).await?;
            spec.newest_release(&json)
        })
        .await
}

async fn uninstall_flow(
    app: &AppHandle,
    db: &DatabaseConnection,
    spec: &'static RuntimeSpec,
) -> Result<(), String> {
    let root = runtimes_root(app)?;
    tokio::task::spawn_blocking(move || remove_runtime_files(&root, spec))
        .await
        .map_err(|e| format!("Removing {} stopped unexpectedly: {e}", spec.display_name))??;
    store::forget(db, spec.id).await
}

/// Mark a runtime as busy. Fails when an install or uninstall of it is already running.
fn begin_operation(
    registry: &DownloadRegistry,
    spec: &RuntimeSpec,
) -> Result<Arc<AtomicBool>, String> {
    registry.register(&operation_key(spec)).map_err(|_| {
        format!(
            "{} is already being installed or removed",
            spec.display_name
        )
    })
}

/// Key in the download registry that serialises operations on one runtime.
fn operation_key(spec: &RuntimeSpec) -> String {
    format!("runtime:{}", spec.id)
}

fn runtimes_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(RUNTIMES_DIR))
        .map_err(|e| format!("app data folder unavailable: {e}"))
}

fn stage_event(spec: &RuntimeSpec, stage: InstallStage, message: &str) -> InstallProgress {
    InstallProgress {
        id: spec.id.to_string(),
        stage,
        received: 0,
        total: 0,
        message: message.to_string(),
    }
}

fn emit_progress(app: &AppHandle, event: &InstallProgress) {
    let _ = app.emit(INSTALL_PROGRESS_EVENT, event);
}

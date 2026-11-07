//! Optional runtimes: list, update check, install and uninstall. Every runtime is an entry of
//! `RUNTIME_SPECS`. An archive runtime (for example stable-diffusion.cpp) is unpacked from its GitHub
//! release into `<app data>/runtimes/<id>/<version>/`; the `installed_runtimes` row names the current
//! one. The GenieX CLI is an installer runtime (see `geniex.rs`).

pub(crate) mod archive;
pub mod release;
pub(crate) mod sherpa_cli;

pub(crate) mod geniex;
mod install;
mod spec;
mod store;

#[cfg(test)]
pub(crate) mod test_support;

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use sea_orm::DatabaseConnection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use super::download::DownloadRegistry;
use super::AppState;
use install::{
    install_release, remove_runtime_files, validate_version, InstallProgress, InstallStage,
    InstalledVersion,
};
use release::{
    fetch_release_json, is_update, release_api_url, release_list_api_url, Release, ReleaseCache,
};
use spec::{find_spec, InstallKind, RuntimeSpec, RUNTIME_SPECS};

pub(crate) use spec::SD_CPP;

/// Event carrying `InstallProgress` while a runtime installs.
const INSTALL_PROGRESS_EVENT: &str = "runtime-install-progress";
/// Folder under the app data dir that holds the archive runtimes.
pub(crate) const RUNTIMES_DIR: &str = "runtimes";

/// One runtime for the Settings list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub id: String,
    pub display_name: String,
    pub repo: String,
    pub installed_version: Option<String>,
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

/// The installed version of a runtime, or None when it is not installed.
async fn installed_version(
    db: &DatabaseConnection,
    spec: &RuntimeSpec,
) -> Result<Option<String>, String> {
    match spec.install {
        InstallKind::Archive(_) => Ok(store::current_install(db, spec.id)
            .await?
            .map(|row| row.version)),
        InstallKind::Installer => Ok(geniex::installed_version().await),
    }
}

/// The version folder of the current install of `spec`, or None when it is not installed. The
/// folder is not checked to exist; the caller does that.
pub(super) async fn current_install_dir(
    db: &DatabaseConnection,
    spec: &RuntimeSpec,
) -> Result<Option<PathBuf>, String> {
    Ok(store::current_install(db, spec.id)
        .await?
        .map(|row| PathBuf::from(row.install_path)))
}

/// Path of the program in the current install of an archive runtime, or None when it is not
/// installed. The program is not checked to exist; the caller does that.
pub(super) async fn current_program(
    db: &DatabaseConnection,
    spec: &RuntimeSpec,
) -> Result<Option<PathBuf>, String> {
    let layout = spec.archive_layout()?;
    Ok(current_install_dir(db, spec)
        .await?
        .map(|dir| layout.exe_path(&dir)))
}

/// Every known runtime with its installed version, if any.
#[tauri::command]
pub async fn runtime_list(db: State<'_, DatabaseConnection>) -> Result<Vec<RuntimeInfo>, String> {
    let mut infos = Vec::with_capacity(RUNTIME_SPECS.len());
    for spec in RUNTIME_SPECS {
        infos.push(RuntimeInfo {
            id: spec.id.to_string(),
            display_name: spec.display_name.to_string(),
            repo: spec.repo.to_string(),
            installed_version: installed_version(&db, spec).await?,
        });
    }
    Ok(infos)
}

/// Compare the installed version with the latest release of a runtime: the newest archive that has
/// a build for this platform, or the latest stable GenieX release. Cached for an hour.
#[tauri::command]
pub async fn runtime_check_update(
    id: String,
    db: State<'_, DatabaseConnection>,
    cache: State<'_, ReleaseCache>,
) -> Result<RuntimeUpdateInfo, String> {
    let spec = find_spec(&id)?;
    let installed = installed_version(&db, spec).await?;
    let latest = latest_release(&cache, spec).await?;
    Ok(update_info(spec, installed, latest))
}

/// Install a runtime. `version` picks an archive release (the latest when it is not given); the
/// GenieX CLI always installs the latest stable release and ignores it. Returns the installed
/// version. Emits `runtime-install-progress` at each stage, and `done` or `error` last.
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
                &stage_event(spec, InstallStage::Done, &format!("Installed {installed}")),
            );
            Ok(installed)
        }
        Err(message) => {
            emit_progress(&app, &stage_event(spec, InstallStage::Error, &message));
            Err(message)
        }
    }
}

/// Remove a runtime: every archive version and its row, or the GenieX CLI through its uninstaller.
/// Refused while it is installing.
#[tauri::command]
pub async fn runtime_uninstall(
    registry: State<'_, DownloadRegistry>,
    db: State<'_, DatabaseConnection>,
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    let spec = find_spec(&id)?;
    begin_operation(&registry, spec)?;
    let outcome = uninstall_flow(&app, &db, &state, spec).await;
    registry.release(&operation_key(spec));
    outcome
}

/// The check result for a runtime. With nothing installed no update is offered, but the latest
/// release is still reported so the UI can offer the install.
fn update_info(
    spec: &RuntimeSpec,
    installed: Option<String>,
    latest: Release,
) -> RuntimeUpdateInfo {
    RuntimeUpdateInfo {
        id: spec.id.to_string(),
        update_available: installed
            .as_deref()
            .is_some_and(|version| is_update(version, &latest.tag)),
        installed_version: installed,
        latest_version: latest.tag,
        release_url: latest.page_url,
    }
}

/// The release a check compares against, for either kind of runtime.
async fn latest_release(cache: &ReleaseCache, spec: &RuntimeSpec) -> Result<Release, String> {
    match spec.install {
        InstallKind::Archive(_) => latest_matching_release(cache, spec).await,
        InstallKind::Installer => geniex::latest_release(cache).await,
    }
}

async fn install_flow(
    app: &AppHandle,
    registry: &DownloadRegistry,
    cache: &ReleaseCache,
    db: &DatabaseConnection,
    spec: &RuntimeSpec,
    version: Option<&str>,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let report = |event: InstallProgress| emit_progress(app, &event);
    match spec.install {
        InstallKind::Archive(_) => {
            let root = runtimes_root(app)?;
            let installed = install_archive(
                registry.client(),
                cancel,
                cache,
                &root,
                spec,
                version,
                &report,
            )
            .await?;
            store::set_current(db, spec.id, &installed).await?;
            Ok(installed.version)
        }
        InstallKind::Installer => {
            let data_dir = app_data_dir(app)?;
            geniex::install(registry.client(), cancel, cache, &data_dir, &report).await
        }
    }
}

/// Look up the archive release (the given version, or the newest one with a build), then download,
/// check and unpack it.
async fn install_archive(
    client: &reqwest::Client,
    cancel: &AtomicBool,
    cache: &ReleaseCache,
    runtimes_root: &Path,
    spec: &RuntimeSpec,
    version: Option<&str>,
    report: install::Reporter<'_>,
) -> Result<InstalledVersion, String> {
    if let Some(version) = version {
        validate_version(version)?;
    }
    report(stage_event(
        spec,
        InstallStage::Checking,
        "Looking up the release",
    ));
    let release = match version {
        Some(version) => {
            let layout = spec.archive_layout()?;
            let api_url = release_api_url(spec.repo, Some(&layout.git_tag(version)));
            cache.get_or_fetch(&api_url, spec.repo).await?
        }
        None => latest_matching_release(cache, spec).await?,
    };
    install_release(client, cancel, runtimes_root, spec, &release, report).await
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
    state: &AppState,
    spec: &'static RuntimeSpec,
) -> Result<(), String> {
    match spec.install {
        InstallKind::Archive(_) => uninstall_archive(app, db, spec).await,
        InstallKind::Installer => geniex::uninstall(state).await,
    }
}

async fn uninstall_archive(
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

/// Key in the download registry that serialises operations on one runtime. The Downloads drawer
/// cancels an install through `cancel_download` with this key.
fn operation_key(spec: &RuntimeSpec) -> String {
    format!("runtime:{}", spec.id)
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("app data folder unavailable: {e}"))
}

fn runtimes_root(app: &AppHandle) -> Result<PathBuf, String> {
    app_data_dir(app).map(|dir| dir.join(RUNTIMES_DIR))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn release(tag: &str) -> Release {
        Release {
            tag: tag.to_string(),
            page_url: format!("https://github.com/qualcomm/GenieX/releases/tag/v{tag}"),
            assets: Vec::new(),
        }
    }

    fn geniex_spec() -> &'static RuntimeSpec {
        find_spec("geniex").expect("geniex is registered")
    }

    #[test]
    fn update_info_without_an_installed_cli_reports_the_latest_release_only() {
        let info = update_info(geniex_spec(), None, release("0.5.0"));
        assert_eq!(info.id, "geniex");
        assert_eq!(info.installed_version, None);
        assert_eq!(info.latest_version, "0.5.0");
        assert!(
            !info.update_available,
            "nothing installed, nothing to update"
        );
        assert_eq!(
            info.release_url,
            "https://github.com/qualcomm/GenieX/releases/tag/v0.5.0"
        );
    }

    #[test]
    fn update_info_offers_a_newer_release_over_an_older_install() {
        let info = update_info(geniex_spec(), Some("0.4.0".into()), release("0.5.0"));
        assert_eq!(info.installed_version.as_deref(), Some("0.4.0"));
        assert!(info.update_available);
    }

    #[test]
    fn update_info_offers_nothing_when_the_install_is_current_or_newer() {
        let same = update_info(geniex_spec(), Some("0.5.0".into()), release("0.5.0"));
        assert!(!same.update_available);
        let newer = update_info(geniex_spec(), Some("0.6.0".into()), release("0.5.0"));
        assert!(!newer.update_available);
    }

    #[test]
    fn stage_event_names_the_runtime_and_carries_no_byte_count() {
        let event = stage_event(geniex_spec(), InstallStage::Installing, "wait");
        assert_eq!(event.id, "geniex");
        assert_eq!((event.received, event.total), (0, 0));
    }

    #[test]
    fn operation_key_is_the_runtime_key_the_downloads_drawer_cancels() {
        assert_eq!(operation_key(geniex_spec()), "runtime:geniex");
    }
}

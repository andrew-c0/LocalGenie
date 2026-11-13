//! The Tauri commands of the MCP server list: list, save, remove, start, stop, refresh and test.
//! Settings live in the database; running servers live in `McpManager`. Each command reads the
//! stored settings and hands the manager the server it acts on.

use sea_orm::DatabaseConnection;
use tauri::{AppHandle, Manager, State};

use super::config::{normalize, McpServerConfig, McpServerInfo};
use super::manager::McpManager;
use super::probe::{self, McpTestResult};
use super::store;

/// Every saved server with its status.
#[tauri::command]
pub async fn mcp_server_list(
    db: State<'_, DatabaseConnection>,
    manager: State<'_, McpManager>,
) -> Result<Vec<McpServerInfo>, String> {
    let configs = store::list(&db).await?;
    configs.iter().map(|config| manager.info(config)).collect()
}

/// Save a server. An empty id makes a new server. A new server that is enabled starts. A running
/// server restarts only when its connection settings changed; a rename, or a change of `enabled`,
/// leaves a running server as it is. Returns its new status.
#[tauri::command]
pub async fn mcp_server_save(
    db: State<'_, DatabaseConnection>,
    manager: State<'_, McpManager>,
    config: McpServerConfig,
) -> Result<McpServerInfo, String> {
    let normalized = normalize(config)?;
    let previous = store::find(&db, &normalized.id).await?;
    let saved = store::save(&db, &normalized, previous.as_ref()).await?;
    let active = manager.is_active(&saved.id)?;
    match save_step(previous.as_ref(), &saved, active) {
        SaveStep::Start => manager.start(saved).await,
        SaveStep::Restart => {
            manager.stop(&saved).await?;
            manager.start(saved).await
        }
        SaveStep::KeepRun => manager.update_settings(&saved),
    }
}

/// What saving a server does to how it runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SaveStep {
    /// A new server that is enabled starts now.
    Start,
    /// A running server whose connection settings changed restarts with the new ones.
    Restart,
    /// The run stays as it is, whatever `enabled` says.
    KeepRun,
}

/// The step for saving `saved`. `previous` is the stored server with the same id, if there is one,
/// and `active` says whether it is starting or running.
fn save_step(
    previous: Option<&McpServerConfig>,
    saved: &McpServerConfig,
    active: bool,
) -> SaveStep {
    match previous {
        None if saved.enabled => SaveStep::Start,
        Some(previous) if active && previous.connection_differs(saved) => SaveStep::Restart,
        _ => SaveStep::KeepRun,
    }
}

/// Remove a server: stop it, then delete its settings.
#[tauri::command]
pub async fn mcp_server_remove(
    db: State<'_, DatabaseConnection>,
    manager: State<'_, McpManager>,
    id: String,
) -> Result<(), String> {
    if let Some(config) = store::find(&db, &id).await? {
        manager.stop(&config).await?;
    }
    manager.forget(&id)?;
    store::delete(&db, &id).await
}

/// Start a saved server. A server that is already running lists its tools again.
#[tauri::command]
pub async fn mcp_server_start(
    db: State<'_, DatabaseConnection>,
    manager: State<'_, McpManager>,
    id: String,
) -> Result<McpServerInfo, String> {
    let config = saved_config(&db, &id).await?;
    manager.start(config).await
}

/// Stop a saved server and close its process.
#[tauri::command]
pub async fn mcp_server_stop(
    db: State<'_, DatabaseConnection>,
    manager: State<'_, McpManager>,
    id: String,
) -> Result<McpServerInfo, String> {
    let config = saved_config(&db, &id).await?;
    manager.stop(&config).await
}

/// List the tools of a running server again and emit its status. A server that is not running is
/// an error.
#[tauri::command]
pub async fn mcp_server_refresh(
    manager: State<'_, McpManager>,
    id: String,
) -> Result<McpServerInfo, String> {
    manager.refresh(&id).await
}

/// Connect to a server with the settings given, list its tools and close it. Nothing is saved or
/// kept running. A server that fails is a result with `ok: false`, not an error.
#[tauri::command]
pub async fn mcp_server_test(config: McpServerConfig) -> Result<McpTestResult, String> {
    Ok(probe::test_server(config).await)
}

/// Start the enabled servers in the background, one task each, so a slow or failing server does not
/// hold up the window. A server that fails is shown as failed.
pub fn start_enabled_servers(app: AppHandle, db: DatabaseConnection) {
    tauri::async_runtime::spawn(async move {
        let configs = match store::list(&db).await {
            Ok(configs) => configs,
            Err(error) => {
                eprintln!("[mcp] could not read the saved servers: {error}");
                return;
            }
        };
        for config in configs.into_iter().filter(|config| config.enabled) {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let manager = app.state::<McpManager>();
                if let Err(error) = manager.start(config).await {
                    eprintln!("[mcp] could not start a saved server: {error}");
                }
            });
        }
    });
}

async fn saved_config(db: &DatabaseConnection, id: &str) -> Result<McpServerConfig, String> {
    store::find(db, id)
        .await?
        .ok_or_else(|| "This MCP server no longer exists. Refresh the list.".to_string())
}

#[cfg(test)]
mod tests {
    use super::super::config::McpTransport;
    use super::*;
    use std::collections::BTreeMap;

    fn saved(enabled: bool) -> McpServerConfig {
        McpServerConfig {
            id: "a".into(),
            name: "Docs".into(),
            transport: McpTransport::Stdio,
            command: Some("npx".into()),
            args: Vec::new(),
            env: BTreeMap::new(),
            cwd: None,
            url: None,
            headers: BTreeMap::new(),
            enabled,
            slug: "docs".into(),
        }
    }

    #[test]
    fn a_new_enabled_server_starts() {
        assert_eq!(save_step(None, &saved(true), false), SaveStep::Start);
    }

    #[test]
    fn a_new_disabled_server_stays_stopped() {
        assert_eq!(save_step(None, &saved(false), false), SaveStep::KeepRun);
    }

    #[test]
    fn a_running_server_with_changed_settings_restarts() {
        let previous = saved(true);
        let changed = McpServerConfig {
            command: Some("node".into()),
            ..saved(true)
        };
        assert_eq!(
            save_step(Some(&previous), &changed, true),
            SaveStep::Restart
        );
    }

    #[test]
    fn a_rename_or_a_switch_does_not_restart_a_running_server() {
        let previous = saved(true);
        let renamed = McpServerConfig {
            name: "Other".into(),
            enabled: false,
            ..saved(true)
        };
        assert_eq!(
            save_step(Some(&previous), &renamed, true),
            SaveStep::KeepRun
        );
    }

    #[test]
    fn a_stopped_server_is_not_started_by_a_save() {
        let previous = saved(false);
        let switched_on = saved(true);
        assert_eq!(
            save_step(Some(&previous), &switched_on, false),
            SaveStep::KeepRun
        );
        let command_changed = McpServerConfig {
            command: Some("node".into()),
            ..saved(true)
        };
        assert_eq!(
            save_step(Some(&previous), &command_changed, false),
            SaveStep::KeepRun
        );
    }
}

//! The Tauri commands of the MCP server list: list, save, remove, start and stop. Settings live in
//! the database; running servers live in `McpManager`. Each command reads the stored settings and
//! hands the manager the server it acts on.

use sea_orm::DatabaseConnection;
use tauri::{AppHandle, Manager, State};

use super::config::{normalize, McpServerConfig, McpServerInfo};
use super::manager::McpManager;
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

/// Save a server. An empty id makes a new server. A server that is running or starting is stopped
/// first; an enabled one is then started, a disabled one stays stopped. Returns its new status.
#[tauri::command]
pub async fn mcp_server_save(
    db: State<'_, DatabaseConnection>,
    manager: State<'_, McpManager>,
    config: McpServerConfig,
) -> Result<McpServerInfo, String> {
    let saved = normalize(config)?;
    store::save(&db, &saved).await?;
    if manager.is_active(&saved.id)? {
        manager.stop(&saved).await?;
    }
    if saved.enabled {
        manager.start(saved).await
    } else {
        manager.info(&saved)
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

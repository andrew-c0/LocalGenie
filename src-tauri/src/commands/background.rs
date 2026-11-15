//! Background running: close to tray, start with Windows, and the explicit exit path.
//! With `keep_running_in_tray` on (off by default), closing the main window hides it and the app keeps
//! running from the tray. Exit (the tray menu, after the frontend confirms) stops the child
//! processes and quits. `start_with_windows` is the autostart plugin's state, started with `--minimized`.

use std::sync::atomic::Ordering;

use sea_orm::DatabaseConnection;
use serde::Serialize;
use tauri::{App, AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

use super::playground::{PlaygroundJobs, SpeechJobs};
use super::tools::mcp::McpManager;
use super::{database, server, AppState};

/// Preference key for "Keep running in the tray when closed".
pub const KEEP_RUNNING_KEY: &str = "keep_running_in_tray";
/// Preference key set once the "still running in the tray" notice has been shown.
const TRAY_HINT_KEY: &str = "tray_hint_shown";
/// Autostart argument: the window stays hidden when Windows starts the app.
pub const MINIMIZED_ARG: &str = "--minimized";
const PREF_TYPE_BOOLEAN: &str = "boolean";

/// Settings the Background section of Settings shows.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundSettings {
    pub keep_running_in_tray: bool,
    pub start_with_windows: bool,
}

/// Reads the stored `keep_running_in_tray` value. Only a stored "true" turns it on; an absent or
/// unrecognised value means off, so closing the window quits the app as it always did.
pub fn parse_keep_running(value: Option<&str>) -> bool {
    matches!(value.map(str::trim), Some("true"))
}

/// True when the process was started with the autostart argument `--minimized`.
pub fn is_minimized_launch<'a>(args: impl IntoIterator<Item = &'a str>) -> bool {
    args.into_iter().any(|arg| arg == MINIMIZED_ARG)
}

/// Startup work for the background shell, run from setup after the database is open.
/// Loads the tray preference into the shared flag and shows the main window unless the app was
/// started with `--minimized`. A failed preference read keeps the default (off) and is logged.
pub fn init(app: &App) {
    let db = app.state::<DatabaseConnection>();
    let stored = tauri::async_runtime::block_on(database::read_preference(&db, KEEP_RUNNING_KEY));
    let keep_running = match stored {
        Ok(value) => parse_keep_running(value.as_deref()),
        Err(e) => {
            eprintln!("[background] could not read {KEEP_RUNNING_KEY}: {e}");
            false
        }
    };
    app.state::<AppState>()
        .keep_running_in_tray
        .store(keep_running, Ordering::SeqCst);

    let args: Vec<String> = std::env::args().collect();
    if is_minimized_launch(args.iter().map(String::as_str)) {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
    }
}

/// Stops the child processes the app started: the GenieX server, playground jobs and MCP servers.
/// Runs from the window `Destroyed` event and from `app_exit`. Each step is safe to repeat.
pub fn cleanup_children(app: &AppHandle) {
    let pid = app
        .state::<AppState>()
        .server_process
        .lock()
        .ok()
        .and_then(|mut proc| proc.take());
    if let Some(pid) = pid {
        server::kill_process_sync(pid);
    }
    app.state::<PlaygroundJobs>().kill_active_sync();
    app.state::<SpeechJobs>().kill_active_sync();
    app.state::<McpManager>().kill_all_sync();
}

/// Shows the one-time "still running" notice the first time the window is hidden to the tray.
/// The check and the notice run in the background, so the close event returns at once.
pub fn show_tray_hint_once(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = maybe_show_tray_hint(&app).await {
            eprintln!("[background] tray hint failed: {e}");
        }
    });
}

async fn maybe_show_tray_hint(app: &AppHandle) -> Result<(), String> {
    let db = app.state::<DatabaseConnection>();
    if database::read_preference(&db, TRAY_HINT_KEY)
        .await?
        .is_some()
    {
        return Ok(());
    }
    app.notification()
        .builder()
        .title("LocalGenie is still running")
        .body("It keeps running in the tray. Use Exit in the tray menu to close it.")
        .show()
        .map_err(|e| format!("Could not show the notification: {e}"))?;
    database::write_preference(&db, TRAY_HINT_KEY, "true", PREF_TYPE_BOOLEAN).await
}

#[tauri::command]
pub fn background_settings_get(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<BackgroundSettings, String> {
    let start_with_windows = app
        .autolaunch()
        .is_enabled()
        .map_err(|e| format!("Could not read the Start with Windows setting: {e}"))?;
    Ok(BackgroundSettings {
        keep_running_in_tray: state.keep_running_in_tray.load(Ordering::SeqCst),
        start_with_windows,
    })
}

#[tauri::command]
pub async fn background_keep_running_in_tray_set(
    enabled: bool,
    db: State<'_, DatabaseConnection>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let value = if enabled { "true" } else { "false" };
    database::write_preference(&db, KEEP_RUNNING_KEY, value, PREF_TYPE_BOOLEAN).await?;
    state.keep_running_in_tray.store(enabled, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn background_start_with_windows_set(enabled: bool, app: AppHandle) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    let result = if enabled {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    };
    result.map_err(|e| {
        let action = if enabled { "turn on" } else { "turn off" };
        format!("Could not {action} Start with Windows: {e}")
    })
}

/// Exit from the tray (after the frontend confirms): stop the child processes, then quit.
#[tauri::command]
pub fn app_exit(app: AppHandle) {
    cleanup_children(&app);
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keep_running_defaults_to_off_when_absent() {
        assert!(!parse_keep_running(None));
    }

    #[test]
    fn keep_running_reads_stored_values() {
        assert!(parse_keep_running(Some("true")));
        assert!(parse_keep_running(Some(" true ")));
        assert!(!parse_keep_running(Some("false")));
    }

    #[test]
    fn keep_running_unknown_value_keeps_default_off() {
        assert!(!parse_keep_running(Some("")));
        assert!(!parse_keep_running(Some("garbage")));
    }

    #[test]
    fn minimized_flag_is_matched_exactly() {
        assert!(is_minimized_launch(["LocalGenie.exe", "--minimized"]));
        assert!(!is_minimized_launch(["LocalGenie.exe"]));
        assert!(!is_minimized_launch(["LocalGenie.exe", "--minimized-x"]));
        assert!(!is_minimized_launch(Vec::<&str>::new()));
    }
}

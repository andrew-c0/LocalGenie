mod commands;
mod gguf;
mod tray;

pub mod entities;
pub mod migrations;

use commands::chat;
use commands::cli;
use commands::cli_update;
use commands::database;
use commands::hub;
use commands::import;
use commands::logs;
use commands::models;
use commands::server;
use commands::system;
use tauri::Manager;
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Resolve DB path in the app data directory.
            let db_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&db_dir)?;
            let db_path = db_dir.join("geniex.db");
            let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

            let db = tauri::async_runtime::block_on(database::init_database(&db_url))?;

            app.manage(db);
            tray::init(app)?;
            Ok(())
        })
        .manage(commands::AppState::default())
        .manage(commands::download::DownloadRegistry::default())
        .invoke_handler(tauri::generate_handler![
            // Model management
            models::list_models,
            models::list_aihub_models,
            models::remove_model,
            hub::search_models,
            models::clean_models,
            models::set_model_type,
            // Server management
            server::start_server,
            server::stop_server,
            server::get_server_status,
            // Chat
            chat::chat_completion,
            chat::cancel_chat_completion,
            chat::load_model,
            chat::unload_all_models,
            // CLI utilities
            cli::check_geniex_installed,
            commands::download::download_file,
            commands::download::cancel_download,
            import::delete_directory,
            import::import_gguf,
            cli::config_get,
            cli::config_set,
            cli::config_list,
            cli_update::check_for_cli_update,
            cli_update::update_geniex,
            logs::get_server_logs,
            logs::clear_server_logs,
            // System
            system::get_system_memory,
            // Database
            database::load_sessions,
            database::save_session,
            database::delete_session,
            database::save_message,
            database::delete_message,
            database::load_model_settings,
            database::save_model_settings,
            database::get_preference,
            database::set_preference,
            database::upsert_downloaded_model,
            database::list_downloaded_models,
            database::delete_downloaded_model,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<commands::AppState>();
                let pid = state
                    .server_process
                    .lock()
                    .ok()
                    .and_then(|mut proc| proc.take());
                if let Some(pid) = pid {
                    server::kill_process_sync(pid);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running LocalGenie");
}

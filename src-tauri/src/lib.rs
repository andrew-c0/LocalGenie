mod commands;

pub mod entities;
pub mod migrations;

use tauri::Manager;
use commands::models;
use commands::server;
use commands::chat;
use commands::database;
use commands::cli;
use commands::system;
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Resolve DB path in the app data directory.
            let db_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&db_dir).ok();
            let db_path = db_dir.join("geniex.db");
            let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

            let db = tauri::async_runtime::block_on(database::init_database(&db_url))
                .expect("failed to initialise database");

            app.manage(db);
            Ok(())
        })
        .manage(commands::AppState::default())
        .manage(commands::download::DownloadRegistry::default())
        .invoke_handler(tauri::generate_handler![
            // Model management
            models::list_models,
            models::list_aihub_models,
            models::pull_model,
            models::remove_model,
            models::search_models,
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
            cli::get_geniex_version,
            commands::download::download_file,
            commands::download::cancel_download,
            commands::download::delete_directory,
            commands::download::import_gguf,
            cli::config_get,
            cli::config_set,
            cli::config_list,
            cli::check_for_cli_update,
            cli::install_geniex,
            cli::update_geniex,
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
                let pid = {
                    let mut proc = state.server_process.lock().unwrap();
                    proc.take()
                };
                if let Some(pid) = pid {
                    server::kill_process_sync(pid);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running LocalGenie");
}

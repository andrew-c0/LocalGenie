mod aihub_proto;
mod commands;
mod gguf;
pub mod model_capabilities;
pub mod model_settings;
mod tray;

pub mod entities;
pub mod migrations;

use commands::aihub;
use commands::attachments;
use commands::benchmark_files;
use commands::benchmark_prompts;
use commands::benchmark_runner;
use commands::benchmark_runs;
use commands::benchmark_suites;
use commands::capabilities;
use commands::capability_scan;
use commands::chat;
use commands::cli;
use commands::cli_update;
use commands::database;
use commands::files;
use commands::hub;
use commands::import;
use commands::logs;
use commands::models;
use commands::playground;
use commands::runtimes;
use commands::server;
use commands::system;
use commands::system_usage;
use tauri::Manager;
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Resolve DB path in the app data directory.
            let db_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&db_dir)?;
            let db_path = db_dir.join("geniex.db");
            let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

            let db = tauri::async_runtime::block_on(database::init_database(&db_url))?;

            // Remove benchmark files that no prompt uses (left behind by a crash or an
            // unsaved editor). A failure here is logged; the app still starts.
            let benchmark_root = db_dir.join(benchmark_files::STORE_DIR);
            if let Err(e) =
                tauri::async_runtime::block_on(benchmark_files::sweep_orphans(&db, &benchmark_root))
            {
                eprintln!("[benchmark] startup sweep failed: {e}");
            }

            app.manage(db);
            tray::init(app)?;
            Ok(())
        })
        .manage(commands::AppState::default())
        .manage(aihub::AihubCache::default())
        .manage(commands::download::DownloadRegistry::default())
        .manage(commands::runtimes::release::ReleaseCache::default())
        .manage(playground::PlaygroundJobs::default())
        .manage(playground::SpeechJobs::default())
        .manage(commands::benchmark_runner::BenchmarkRunState::default())
        .invoke_handler(tauri::generate_handler![
            // Model management
            models::list_models,
            models::list_aihub_models,
            models::remove_model,
            hub::search_models,
            models::clean_models,
            models::set_model_type,
            capabilities::get_model_capabilities,
            capabilities::get_context_memory,
            capability_scan::load_model_capabilities,
            capability_scan::scan_model_capabilities,
            capability_scan::cancel_capability_scan,
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
            cli::get_runtime_versions,
            commands::download::download_file,
            commands::download::cancel_download,
            import::import_gguf,
            import::import_aihub_zip,
            cli::config_get,
            cli::config_set,
            cli::config_list,
            cli_update::check_for_cli_update,
            cli_update::update_geniex,
            logs::get_server_logs,
            logs::clear_server_logs,
            // System
            system::get_system_memory,
            system::get_platform_info,
            system_usage::get_system_usage,
            // Chat attachments (image, audio, text picked for a message)
            attachments::pick_attachment,
            attachments::read_attachment,
            attachments::reveal_attachment,
            // Optional runtimes (GitHub releases, side-by-side installs)
            runtimes::runtime_list,
            runtimes::runtime_check_update,
            runtimes::runtime_install,
            runtimes::runtime_uninstall,
            // Playground text-to-image (curated models, sd-cli jobs, generated images)
            playground::playground_image_models,
            playground::playground_download_model,
            playground::playground_generate_image,
            playground::playground_cancel_image,
            playground::playground_read_image,
            playground::playground_reveal_image,
            playground::playground_list_devices,
            playground::playground_delete_model,
            // Playground speech (sherpa-onnx speech to text and text to speech)
            playground::speech_commands::playground_speech_models,
            playground::speech_commands::playground_download_speech_model,
            playground::speech_commands::playground_delete_speech_model,
            playground::speech_commands::playground_transcribe,
            playground::speech_commands::playground_synthesize,
            playground::speech_commands::playground_cancel_speech,
            playground::speech_commands::playground_store_audio,
            playground::speech_commands::playground_read_audio,
            playground::speech_commands::playground_reveal_audio,
            // Qualcomm AI Hub catalog (read-only)
            aihub::aihub_latest_version,
            aihub::aihub_list_models,
            aihub::aihub_model_detail,
            aihub::aihub_model_readme,
            // Benchmark library (prompts and their files)
            benchmark_files::import_benchmark_file,
            benchmark_files::discard_benchmark_file,
            benchmark_prompts::list_benchmark_prompts,
            benchmark_prompts::save_benchmark_prompt,
            benchmark_prompts::delete_benchmark_prompt,
            benchmark_suites::list_benchmark_suites,
            benchmark_suites::save_benchmark_suite,
            benchmark_suites::delete_benchmark_suite,
            benchmark_runner::start_benchmark_run,
            benchmark_runner::cancel_benchmark_run,
            benchmark_runs::list_benchmark_runs,
            benchmark_runs::get_benchmark_run_steps,
            benchmark_runs::save_benchmark_export,
            benchmark_runs::save_benchmark_image,
            benchmark_runs::open_benchmark_export,
            // Files (system prompt attachments)
            files::pick_text_file,
            files::read_text_file,
            files::file_exists,
            // Database
            database::load_sessions,
            database::save_session,
            database::delete_session,
            database::save_message,
            database::delete_message,
            database::save_chat_error,
            database::delete_chat_error,
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
                window
                    .state::<playground::PlaygroundJobs>()
                    .kill_active_sync();
                window.state::<playground::SpeechJobs>().kill_active_sync();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running LocalGenie");
}

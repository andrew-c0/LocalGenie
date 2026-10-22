use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{App, Manager};

/// Create the system tray icon: the Fluent sparkle glyph used in the app's menu.
/// A left click brings the main window back from the taskbar or minimized state.
pub fn init(app: &App) -> tauri::Result<()> {
    let icon = tauri::include_image!("icons/tray-icon.png");

    let tray: TrayIcon = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("LocalGenie")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    // Keep the tray alive for the whole app lifetime.
    app.manage(tray);
    Ok(())
}

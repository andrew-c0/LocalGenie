use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

/// Sent to the frontend (no payload) when Exit is chosen. The frontend confirms, then calls `app_exit`.
const EXIT_REQUESTED_EVENT: &str = "exit-requested";
const OPEN_ITEM_ID: &str = "open";
const EXIT_ITEM_ID: &str = "exit";
const MAIN_WINDOW_LABEL: &str = "main";
/// Tooltip text when the frontend sets none, and the notification title fallback.
const APP_NAME: &str = "LocalGenie";
/// Windows cuts tooltips at 127 UTF-16 units; 120 characters keeps a margin.
const TOOLTIP_MAX_CHARS: usize = 120;
const NOTIFY_TITLE_MAX_CHARS: usize = 64;
const NOTIFY_BODY_MAX_CHARS: usize = 200;

/// Create the system tray icon: the Fluent sparkle glyph used in the app's menu.
/// A left click brings the main window back from the taskbar, tray or minimized state.
/// A right click opens the menu: Open LocalGenie and Exit.
pub fn init(app: &App) -> tauri::Result<()> {
    let icon = tauri::include_image!("icons/tray-icon.png");

    let open_item = MenuItemBuilder::with_id(OPEN_ITEM_ID, "Open LocalGenie").build(app)?;
    let exit_item = MenuItemBuilder::with_id(EXIT_ITEM_ID, "Exit").build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&open_item)
        .separator()
        .item(&exit_item)
        .build()?;

    let tray: TrayIcon = TrayIconBuilder::new()
        .icon(icon)
        .tooltip(APP_NAME)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN_ITEM_ID => show_main_window(app),
            EXIT_ITEM_ID => {
                show_main_window(app);
                if let Err(e) = app.emit(EXIT_REQUESTED_EVENT, ()) {
                    eprintln!("[tray] could not send {EXIT_REQUESTED_EVENT}: {e}");
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    // Keep the tray alive for the whole app lifetime.
    app.manage(tray);
    Ok(())
}

/// Show the main window, restoring it from minimized, and give it focus.
pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Trims `text` and cuts it to at most `max_chars` characters. A cut ends with "…".
/// Counts characters, not bytes, so a multi-byte character is never split.
pub fn truncate_chars(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }
    if max_chars == 0 {
        return String::new();
    }
    let kept: String = trimmed.chars().take(max_chars - 1).collect();
    format!("{kept}…")
}

/// Tooltip text to apply: `None`, or a blank string, resets to "LocalGenie"; long text is cut.
pub fn normalise_tooltip(text: Option<&str>) -> String {
    let tooltip = text
        .map(|t| truncate_chars(t, TOOLTIP_MAX_CHARS))
        .unwrap_or_default();
    if tooltip.is_empty() {
        APP_NAME.to_string()
    } else {
        tooltip
    }
}

/// Notification title to show: trimmed, cut to the title limit, "LocalGenie" when blank.
pub fn notice_title(title: &str) -> String {
    let title = truncate_chars(title, NOTIFY_TITLE_MAX_CHARS);
    if title.is_empty() {
        APP_NAME.to_string()
    } else {
        title
    }
}

/// Notification body to show: trimmed and cut to the body limit.
pub fn notice_body(body: &str) -> String {
    truncate_chars(body, NOTIFY_BODY_MAX_CHARS)
}

/// A notification is wanted only when the user cannot see the window: hidden or minimized.
pub fn should_notify(visible: bool, minimized: bool) -> bool {
    !visible || minimized
}

/// Sets the tray icon tooltip. `None` or blank text resets it to "LocalGenie".
#[tauri::command]
pub fn tray_set_tooltip(text: Option<String>, tray: State<'_, TrayIcon>) -> Result<(), String> {
    let tooltip = normalise_tooltip(text.as_deref());
    tray.set_tooltip(Some(tooltip))
        .map_err(|e| format!("Could not set the tray tooltip: {e}"))
}

/// Shows a Windows notification when the main window is hidden or minimized.
/// Returns `true` when a notification was shown, `false` when the window is on screen.
/// A missing main window counts as hidden.
#[tauri::command]
pub fn notify_if_hidden(title: String, body: String, app: AppHandle) -> Result<bool, String> {
    let (visible, minimized) = match app.get_webview_window(MAIN_WINDOW_LABEL) {
        Some(window) => (
            window
                .is_visible()
                .map_err(|e| format!("Could not read the window visibility: {e}"))?,
            window
                .is_minimized()
                .map_err(|e| format!("Could not read the window state: {e}"))?,
        ),
        None => (false, false),
    };
    if !should_notify(visible, minimized) {
        return Ok(false);
    }
    app.notification()
        .builder()
        .title(notice_title(&title))
        .body(notice_body(&body))
        .show()
        .map_err(|e| format!("Could not show the notification: {e}"))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tooltip_none_resets_to_app_name() {
        assert_eq!(normalise_tooltip(None), "LocalGenie");
    }

    #[test]
    fn tooltip_blank_resets_to_app_name() {
        assert_eq!(normalise_tooltip(Some("")), "LocalGenie");
        assert_eq!(normalise_tooltip(Some("   \t ")), "LocalGenie");
    }

    #[test]
    fn tooltip_short_text_is_trimmed_and_kept() {
        assert_eq!(
            normalise_tooltip(Some("  Downloading 42%  ")),
            "Downloading 42%"
        );
    }

    #[test]
    fn tooltip_exactly_120_chars_is_kept_whole() {
        let text = "a".repeat(120);
        assert_eq!(normalise_tooltip(Some(&text)), text);
    }

    #[test]
    fn tooltip_121_chars_is_cut_to_120_with_ellipsis() {
        let text = "a".repeat(121);
        let out = normalise_tooltip(Some(&text));
        assert_eq!(out.chars().count(), 120);
        assert!(out.ends_with('…'));
        assert_eq!(out, format!("{}…", "a".repeat(119)));
    }

    #[test]
    fn truncate_does_not_split_multibyte_characters() {
        // "é" is two bytes and the emoji is four; both must stay whole.
        let text = "é".repeat(200);
        let out = truncate_chars(&text, 10);
        assert_eq!(out, format!("{}…", "é".repeat(9)));

        let emoji = "🎉".repeat(200);
        let out = truncate_chars(&emoji, 120);
        assert_eq!(out.chars().count(), 120);
        assert!(out.starts_with("🎉"));
        assert!(out.ends_with('…'));
    }

    #[test]
    fn truncate_zero_limit_returns_empty() {
        assert_eq!(truncate_chars("anything", 0), "");
    }

    #[test]
    fn notice_title_is_cut_at_64_and_falls_back_when_blank() {
        assert_eq!(notice_title("   "), "LocalGenie");
        assert_eq!(notice_title("Download done"), "Download done");
        let long = "t".repeat(100);
        assert_eq!(notice_title(&long).chars().count(), 64);
    }

    #[test]
    fn notice_body_is_cut_at_200() {
        assert_eq!(notice_body(&"b".repeat(200)).chars().count(), 200);
        let out = notice_body(&"b".repeat(300));
        assert_eq!(out.chars().count(), 200);
        assert!(out.ends_with('…'));
    }

    #[test]
    fn notify_only_when_hidden_or_minimized() {
        assert!(!should_notify(true, false));
        assert!(should_notify(true, true));
        assert!(should_notify(false, false));
        assert!(should_notify(false, true));
    }
}

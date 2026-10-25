//! The Windows power plan and battery state, recorded with each benchmark run.

/// Power state at the time of a run. A field is None when Windows does not report it.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PowerState {
    /// Name of the active plan, for example `Balanced`, `Power saver` or `High performance`.
    pub windows_power_plan: Option<String>,
    /// True when the battery is supplying the machine. None on a machine without a battery.
    pub on_battery: Option<bool>,
}

/// Read the active plan and the battery state. Blocking: it starts two Windows tools, so call it
/// from `spawn_blocking`. Off Windows, both fields are None.
pub fn read_power_state() -> PowerState {
    PowerState {
        windows_power_plan: active_plan_name(),
        on_battery: on_battery(),
    }
}

#[cfg(target_os = "windows")]
fn active_plan_name() -> Option<String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let output = std::process::Command::new("powercfg")
        .arg("/getactivescheme")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    parse_active_plan(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(not(target_os = "windows"))]
fn active_plan_name() -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
fn on_battery() -> Option<bool> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "(Get-CimInstance Win32_Battery | Select-Object -First 1).BatteryStatus",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    parse_battery_status(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(not(target_os = "windows"))]
fn on_battery() -> Option<bool> {
    None
}

/// The name in `powercfg /getactivescheme` output: `Power Scheme GUID: <guid>  (<name>)`.
pub fn parse_active_plan(output: &str) -> Option<String> {
    let line = output.lines().find(|l| l.contains("Power Scheme GUID"))?;
    let open = line.rfind('(')?;
    let close = line.rfind(')')?;
    let name = line.get(open + 1..close)?.trim();
    (!name.is_empty()).then(|| name.to_string())
}

/// The `BatteryStatus` code from Win32_Battery. 1 (discharging), 4 (low) and 5 (critical) mean the
/// battery is supplying the machine; the other codes mean mains power or charging.
pub fn parse_battery_status(output: &str) -> Option<bool> {
    let code: u32 = output.trim().parse().ok()?;
    Some(matches!(code, 1 | 4 | 5))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_plan_name_from_powercfg_output() {
        let output = "Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)\r\n";
        assert_eq!(parse_active_plan(output).as_deref(), Some("Balanced"));
        assert_eq!(parse_active_plan("no plan here"), None);
    }

    #[test]
    fn reads_battery_state_from_the_status_code() {
        assert_eq!(parse_battery_status("1\r\n"), Some(true));
        assert_eq!(parse_battery_status("2\r\n"), Some(false));
        assert_eq!(parse_battery_status(""), None);
    }
}

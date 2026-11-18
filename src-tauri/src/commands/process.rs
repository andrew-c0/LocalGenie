//! Child processes started without a console window.
//!
//! On Windows a console program started from a GUI app opens its own console window unless the
//! child is created with `CREATE_NO_WINDOW`. Every spawn of a console program (`geniex`,
//! `taskkill`, `attrib`, `powershell`) calls one of these helpers. Elsewhere they do nothing.

/// Windows process-creation flag: the child gets no console window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Keep a console program from opening a console window. No-op outside Windows.
#[cfg(windows)]
pub(crate) fn hide_console(command: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
}

/// Keep a console program from opening a console window. No-op outside Windows.
#[cfg(not(windows))]
pub(crate) fn hide_console(_command: &mut std::process::Command) {}

/// `hide_console` for a `tokio::process::Command`.
pub(crate) fn hide_console_tokio(command: &mut tokio::process::Command) {
    hide_console(command.as_std_mut());
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A std command that prints `hello`: `cmd /C echo` on Windows, `echo` elsewhere.
    fn echo_command() -> std::process::Command {
        if cfg!(windows) {
            let mut command = std::process::Command::new("cmd");
            command.args(["/C", "echo hello"]);
            command
        } else {
            let mut command = std::process::Command::new("echo");
            command.arg("hello");
            command
        }
    }

    #[test]
    fn hidden_std_command_still_runs_and_returns_output() {
        let mut command = echo_command();
        hide_console(&mut command);
        let output = command.output().expect("spawn the echo command");
        assert!(output.status.success());
        assert!(String::from_utf8_lossy(&output.stdout).contains("hello"));
    }

    #[tokio::test]
    async fn hidden_tokio_command_still_runs_and_returns_output() {
        let mut command = tokio::process::Command::from(echo_command());
        hide_console_tokio(&mut command);
        let output = command.output().await.expect("spawn the echo command");
        assert!(output.status.success());
        assert!(String::from_utf8_lossy(&output.stdout).contains("hello"));
    }
}

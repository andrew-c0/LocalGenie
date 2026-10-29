//! The command every call to the stable-diffusion.cpp program (`sd-cli`) starts from: the program's
//! own folder, no console window on Windows, and the child killed if the command is dropped.

use std::path::Path;
use std::process::Stdio;

use tokio::process::Command;

/// Windows flag that keeps sd-cli from opening a console window.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A command that runs `program` from its own folder with stdin closed. The caller adds the
/// arguments and says where the output goes.
pub(super) fn command(program: &Path) -> Result<Command, String> {
    let Some(folder) = program.parent() else {
        return Err(format!("Cannot find the folder of {}", program.display()));
    };
    let mut command = Command::new(program);
    command
        .current_dir(folder)
        .stdin(Stdio::null())
        .kill_on_drop(true);
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    Ok(command)
}

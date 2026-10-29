//! The command every call to a Playground runtime program starts from: stable-diffusion.cpp's
//! `sd-cli` and the sherpa-onnx speech programs. The caller picks the program's folder, which is
//! the program's own folder so its DLLs load. There is no console window on Windows, and the child
//! is killed if the command is dropped.

use std::path::Path;
use std::process::Stdio;

use tokio::process::Command;

/// Windows flag that keeps a runtime program from opening a console window.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The folder a program sits in, which is where it runs from.
pub(super) fn folder_of(program: &Path) -> Result<&Path, String> {
    program
        .parent()
        .ok_or_else(|| format!("Cannot find the folder of {}", program.display()))
}

/// A command that runs `program` from `folder` with stdin closed. The caller adds the arguments
/// and says where the output goes.
pub(super) fn command(program: &Path, folder: &Path) -> Command {
    let mut command = Command::new(program);
    command
        .current_dir(folder)
        .stdin(Stdio::null())
        .kill_on_drop(true);
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

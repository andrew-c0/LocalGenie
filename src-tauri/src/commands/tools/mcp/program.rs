//! Finds the program a stdio server starts, and builds the command for it. On Windows a name such
//! as `npx` is `npx.cmd`, so the name is tried with each PATHEXT extension in each PATH folder, the
//! way the shell does. The child gets no console window and is killed if its command is dropped.

use std::env;
use std::path::{Path, PathBuf};

use tokio::process::Command;

/// Windows flag that keeps a child process from opening a console window.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// The extensions Windows tries when PATHEXT is not set.
const DEFAULT_PATHEXT: &str = ".COM;.EXE;.BAT;.CMD";

/// The file a server's `command` names, found through PATH (and PATHEXT on Windows). A name with a
/// folder part is used as it is.
pub fn resolve_program(program: &str) -> Result<PathBuf, String> {
    let has_folder = program.contains(['/', '\\']);
    let dirs = if has_folder {
        vec![PathBuf::new()]
    } else {
        env::var_os("PATH")
            .map(|paths| env::split_paths(&paths).collect())
            .unwrap_or_default()
    };
    let exts = if cfg!(windows) {
        parse_pathext(&env::var("PATHEXT").unwrap_or_else(|_| DEFAULT_PATHEXT.to_string()))
    } else {
        Vec::new()
    };
    resolve_in(program, &dirs, &exts, |path| path.is_file()).ok_or_else(|| {
        format!("Cannot find '{program}'. Install it, or give the full path to the program.")
    })
}

/// The first existing file among the candidates of `program`, folder by folder, extension by
/// extension. `exts` is empty where extensions do not apply.
pub fn resolve_in(
    program: &str,
    dirs: &[PathBuf],
    exts: &[String],
    is_file: impl Fn(&Path) -> bool,
) -> Option<PathBuf> {
    dirs.iter()
        .flat_map(|dir| candidates(dir, program, exts))
        .find(|path| is_file(path))
}

/// The extensions of a PATHEXT value such as `.COM;.EXE`, in order. Blank entries are dropped.
pub fn parse_pathext(pathext: &str) -> Vec<String> {
    pathext
        .split(';')
        .map(str::trim)
        .filter(|ext| !ext.is_empty())
        .map(str::to_string)
        .collect()
}

/// The paths `program` may be in `dir`. A name that already has a known extension is tried as it is.
fn candidates(dir: &Path, program: &str, exts: &[String]) -> Vec<PathBuf> {
    let plain = dir.join(program);
    if exts.is_empty() || has_known_extension(program, exts) {
        return vec![plain];
    }
    exts.iter()
        .map(|ext| dir.join(format!("{program}{ext}")))
        .collect()
}

fn has_known_extension(program: &str, exts: &[String]) -> bool {
    Path::new(program)
        .extension()
        .map(|ext| format!(".{}", ext.to_string_lossy()))
        .is_some_and(|with_dot| {
            exts.iter()
                .any(|known| known.eq_ignore_ascii_case(&with_dot))
        })
}

/// The working folder a stdio server starts in: `cwd` when the server has one (it must exist and be
/// a folder), else None for the app's folder.
pub fn working_folder(cwd: Option<&str>) -> Result<Option<PathBuf>, String> {
    let Some(text) = cwd else {
        return Ok(None);
    };
    let folder = Path::new(text);
    if folder.is_dir() {
        Ok(Some(folder.to_path_buf()))
    } else if folder.exists() {
        Err(format!("The working folder '{text}' is not a folder."))
    } else {
        Err(format!("The working folder '{text}' does not exist."))
    }
}

/// The command that runs `program`: no console window on Windows, and the child is killed if the
/// command is dropped. The caller adds arguments, environment and its stdio.
pub fn command(program: &Path) -> Command {
    let mut command = Command::new(program);
    command.kill_on_drop(true);
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::tools::test_support::TempTree;

    fn windows_exts() -> Vec<String> {
        parse_pathext(DEFAULT_PATHEXT)
    }

    /// A path as text for comparison: Windows paths are case-insensitive and accept either slash.
    fn shown_path(path: &Path) -> String {
        path.to_string_lossy()
            .replace('/', "\\")
            .to_ascii_lowercase()
    }

    /// The path a lookup found, as text for comparison.
    fn shown(found: Option<PathBuf>) -> Option<String> {
        found.map(|path| shown_path(&path))
    }

    #[test]
    fn pathext_is_split_in_order_and_blanks_are_dropped() {
        assert_eq!(parse_pathext(".COM; .EXE;;.CMD "), [".COM", ".EXE", ".CMD"]);
    }

    #[test]
    fn a_bare_name_finds_the_cmd_shim_in_a_later_folder() {
        let tree = TempTree::new("program-shim");
        let sh_folder = tree.folder("a");
        std::fs::write(sh_folder.join("npx"), b"#!/bin/sh").expect("write");
        let cmd_folder = tree.folder("b");
        let cmd = tree.file("b/npx.cmd", b"@echo off");

        let found = resolve_in("npx", &[sh_folder, cmd_folder], &windows_exts(), |path| {
            path.is_file()
        });
        assert_eq!(shown(found), Some(shown_path(&cmd)));
    }

    #[test]
    fn an_earlier_extension_wins_within_a_folder() {
        let tree = TempTree::new("program-order");
        let folder = tree.folder("bin");
        tree.file("bin/tool.cmd", b"");
        let exe = tree.file("bin/tool.exe", b"");

        let found = resolve_in("tool", &[folder], &windows_exts(), |path| path.is_file());
        assert_eq!(shown(found), Some(shown_path(&exe)));
    }

    #[test]
    fn a_name_with_a_known_extension_is_used_as_it_is() {
        let tree = TempTree::new("program-ext");
        let folder = tree.folder("bin");
        let cmd = tree.file("bin/npx.cmd", b"");

        let found = resolve_in("npx.cmd", &[folder], &windows_exts(), |path| path.is_file());
        assert_eq!(shown(found), Some(shown_path(&cmd)));
    }

    #[test]
    fn a_missing_program_is_not_found() {
        let tree = TempTree::new("program-missing");
        let folder = tree.folder("bin");
        tree.file("bin/other.exe", b"");

        let found = resolve_in("npx", &[folder], &windows_exts(), |path| path.is_file());
        assert_eq!(found, None);
    }

    #[test]
    fn without_extensions_only_the_plain_name_is_tried() {
        let tree = TempTree::new("program-plain");
        let folder = tree.folder("bin");
        tree.file("bin/server.cmd", b"");
        let plain = tree.file("bin/server", b"");

        let found = resolve_in("server", &[folder], &[], |path| path.is_file());
        assert_eq!(shown(found), Some(shown_path(&plain)));
    }

    #[test]
    fn a_full_path_is_checked_as_given() {
        let tree = TempTree::new("program-full");
        let file = tree.file("tools/server.exe", b"");
        let found = resolve_in(
            &file.to_string_lossy(),
            &[PathBuf::new()],
            &windows_exts(),
            |path| path.is_file(),
        );
        assert_eq!(shown(found), Some(shown_path(&file)));
    }

    #[test]
    fn no_working_folder_means_the_app_folder() {
        assert_eq!(working_folder(None), Ok(None));
    }

    #[test]
    fn an_existing_folder_is_the_working_folder() {
        let tree = TempTree::new("program-cwd-ok");
        let folder = tree.folder("project");
        let text = folder.to_string_lossy().into_owned();
        assert_eq!(working_folder(Some(&text)), Ok(Some(folder)));
    }

    #[test]
    fn a_missing_working_folder_fails_the_start_with_a_readable_message() {
        let tree = TempTree::new("program-cwd-missing");
        let text = tree.path().join("gone").to_string_lossy().into_owned();
        let error = working_folder(Some(&text)).expect_err("missing");
        assert_eq!(
            error,
            format!("The working folder '{text}' does not exist.")
        );
    }

    #[test]
    fn a_file_is_not_a_working_folder() {
        let tree = TempTree::new("program-cwd-file");
        let file = tree.file("server.js", b"");
        let text = file.to_string_lossy().into_owned();
        let error = working_folder(Some(&text)).expect_err("file");
        assert_eq!(
            error,
            format!("The working folder '{text}' is not a folder.")
        );
    }

    #[test]
    fn an_unknown_program_gives_a_readable_error() {
        let error = resolve_program("localgenie-no-such-program-xyz").expect_err("missing");
        assert!(error.starts_with("Cannot find 'localgenie-no-such-program-xyz'."));
    }
}

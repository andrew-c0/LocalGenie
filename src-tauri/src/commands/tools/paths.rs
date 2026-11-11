use std::path::{Path, PathBuf};

/// Resolve `path` to a canonical path inside one of the `allowed` folders.
///
/// Both sides are canonicalized, so `..` segments and symlinks cannot leave an allowed folder.
/// Allowed folders that do not exist are skipped. A path below an allowed folder is refused when
/// any folder or file on the way is hidden or system.
pub(super) fn resolve_allowed(path: &str, allowed: &[String]) -> Result<PathBuf, String> {
    let roots = usable_folders(allowed)?;
    let target = std::fs::canonicalize(path).map_err(|_| not_found_message(path))?;
    let (root, relative) = roots
        .iter()
        .find_map(|root| {
            target
                .strip_prefix(root)
                .ok()
                .map(|relative| (root, relative))
        })
        .ok_or_else(|| outside_message(allowed))?;
    refuse_hidden_below(root, relative)?;
    Ok(target)
}

/// Canonical forms of the allowed folders that exist and are folders. Errors when no folder is
/// allowed, or none of them exists.
pub(super) fn usable_folders(allowed: &[String]) -> Result<Vec<PathBuf>, String> {
    if allowed.is_empty() {
        return Err("No folders are allowed for file tools".into());
    }
    let roots: Vec<PathBuf> = allowed
        .iter()
        .filter_map(|folder| std::fs::canonicalize(folder).ok())
        .filter(|root| root.is_dir())
        .collect();
    if roots.is_empty() {
        return Err("None of the allowed folders could be found".into());
    }
    Ok(roots)
}

/// The error for a path outside the allowed folders. It names them as the caller gave them.
fn outside_message(allowed: &[String]) -> String {
    format!(
        "The path is outside the folders the user allowed. Allowed folders: {}",
        allowed.join("; ")
    )
}

/// The error for a missing path. A relative path gets a hint about full paths and `list_directory`.
fn not_found_message(path: &str) -> String {
    let mut message = format!("File or folder not found: {path}");
    if !Path::new(path).is_absolute() {
        message.push_str(
            " Use a full path inside the allowed folders, or call list_directory without a path to see them.",
        );
    }
    message
}

/// A path as text for the model and the UI: without the Windows `\\?\` prefix of a canonical
/// path. A UNC share keeps its leading `\\`.
pub(super) fn display_path(path: &Path) -> String {
    let text = path.to_string_lossy().into_owned();
    if let Some(share) = text.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{share}");
    }
    let plain = text.strip_prefix(r"\\?\").map(str::to_string);
    plain.unwrap_or(text)
}

/// Refuse `relative` (the part of a target below `root`) when a part of it is hidden or system.
/// The root itself is not checked: the user chose it.
fn refuse_hidden_below(root: &Path, relative: &Path) -> Result<(), String> {
    let mut current = root.to_path_buf();
    for part in relative.components() {
        current.push(part);
        let hidden = std::fs::metadata(&current).is_ok_and(|meta| is_hidden_or_system(&meta));
        if hidden {
            return Err(format!(
                "The path uses a hidden or system item and is not allowed: {}",
                part.as_os_str().to_string_lossy()
            ));
        }
    }
    Ok(())
}

/// Whether an item carries the Windows hidden or system attribute.
#[cfg(windows)]
pub(super) fn is_hidden_or_system(metadata: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
    metadata.file_attributes() & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM) != 0
}

/// Hidden and system attributes are a Windows concept; elsewhere nothing is refused.
#[cfg(not(windows))]
pub(super) fn is_hidden_or_system(_metadata: &std::fs::Metadata) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::{display_path, resolve_allowed, usable_folders};
    use crate::commands::tools::test_support::TempTree;
    use std::path::{Path, PathBuf};

    fn text_of(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn display_path_strips_the_windows_verbatim_prefix() {
        assert_eq!(display_path(Path::new(r"\\?\C:\Users\a.png")), r"C:\Users\a.png");
        assert_eq!(display_path(Path::new(r"\\?\UNC\server\share\a.png")), r"\\server\share\a.png");
        assert_eq!(display_path(Path::new(r"C:\plain\a.png")), r"C:\plain\a.png");
    }

    #[test]
    fn usable_folders_refuses_an_empty_or_missing_allow_list() {
        let tree = TempTree::new("paths-usable");
        assert_eq!(
            usable_folders(&[]).unwrap_err(),
            "No folders are allowed for file tools"
        );
        let missing = text_of(&tree.path().join("nope"));
        assert_eq!(
            usable_folders(&[missing]).unwrap_err(),
            "None of the allowed folders could be found"
        );
    }

    #[test]
    fn usable_folders_keeps_only_the_folders_that_exist() {
        let tree = TempTree::new("paths-usable-some");
        let root = tree.folder("root");
        let file = tree.file("plain.txt", b"x");
        let folders = usable_folders(&[
            text_of(&tree.path().join("nope")),
            text_of(&file),
            text_of(&root),
        ])
        .expect("one usable folder");
        assert_eq!(folders, [std::fs::canonicalize(&root).expect("canonical")]);
    }

    #[test]
    fn accepts_a_file_inside_an_allowed_folder() {
        let tree = TempTree::new("paths-inside");
        let root = tree.folder("root");
        let file = tree.file("root/notes.txt", b"hi");
        let resolved = resolve_allowed(&text_of(&file), &[text_of(&root)]).expect("inside");
        assert!(resolved.ends_with("notes.txt"));
    }

    #[test]
    fn refuses_a_file_outside_the_allowed_folders() {
        let tree = TempTree::new("paths-outside");
        let root = tree.folder("root");
        tree.folder("other");
        let file = tree.file("other/secret.txt", b"nope");
        let result = resolve_allowed(&text_of(&file), &[text_of(&root)]);
        assert_eq!(
            result.unwrap_err(),
            format!(
                "The path is outside the folders the user allowed. Allowed folders: {}",
                text_of(&root)
            )
        );
    }

    #[test]
    fn outside_error_names_every_allowed_folder_as_given() {
        let tree = TempTree::new("paths-outside-names");
        let first = tree.folder("first");
        let second = tree.folder("second");
        let file = tree.file("elsewhere/secret.txt", b"nope");
        let allowed = [text_of(&first), text_of(&second)];
        let message = resolve_allowed(&text_of(&file), &allowed).unwrap_err();
        assert_eq!(
            message,
            format!(
                "The path is outside the folders the user allowed. Allowed folders: {}; {}",
                allowed[0], allowed[1]
            )
        );
    }

    #[test]
    fn relative_missing_path_gets_a_hint_about_full_paths() {
        let tree = TempTree::new("paths-relative");
        let root = tree.folder("root");
        let message =
            resolve_allowed("localgenie-no-such-file-here.txt", &[text_of(&root)]).unwrap_err();
        assert_eq!(
            message,
            "File or folder not found: localgenie-no-such-file-here.txt Use a full path inside the allowed folders, or call list_directory without a path to see them."
        );
    }

    #[test]
    fn absolute_missing_path_has_no_hint() {
        let tree = TempTree::new("paths-absolute-missing");
        let root = tree.folder("root");
        let target = root.join("absent.txt");
        let message = resolve_allowed(&text_of(&target), &[text_of(&root)]).unwrap_err();
        assert_eq!(
            message,
            format!("File or folder not found: {}", text_of(&target))
        );
    }

    #[test]
    fn display_path_of_a_resolved_file_has_no_verbatim_prefix() {
        let tree = TempTree::new("paths-display");
        let root = tree.folder("root");
        let file = tree.file("root/notes.txt", b"hi");
        let resolved = resolve_allowed(&text_of(&file), &[text_of(&root)]).expect("inside");
        let shown = display_path(&resolved);
        assert!(!shown.starts_with(r"\\?\"), "{shown}");
        assert!(PathBuf::from(&shown).ends_with("notes.txt"));
    }

    #[test]
    fn refuses_a_dot_dot_escape() {
        let tree = TempTree::new("paths-dotdot");
        let root = tree.folder("root");
        tree.file("other/secret.txt", b"nope");
        let escape = root.join("..").join("other").join("secret.txt");
        let result = resolve_allowed(&text_of(&escape), &[text_of(&root)]);
        assert!(result.is_err());
    }

    #[test]
    fn refuses_a_symlink_that_leaves_the_allowed_folder() {
        let tree = TempTree::new("paths-symlink");
        let root = tree.folder("root");
        let outside = tree.file("other/secret.txt", b"nope");
        let link = root.join("link.txt");
        if !try_symlink_file(&outside, &link) {
            return;
        }
        let result = resolve_allowed(&text_of(&link), &[text_of(&root)]);
        assert!(result.is_err());
    }

    #[test]
    fn empty_allow_list_refuses_everything() {
        let tree = TempTree::new("paths-empty");
        let file = tree.file("notes.txt", b"hi");
        let result = resolve_allowed(&text_of(&file), &[]);
        assert_eq!(result.unwrap_err(), "No folders are allowed for file tools");
    }

    #[test]
    fn missing_allowed_folder_is_skipped() {
        let tree = TempTree::new("paths-missing");
        let root = tree.folder("root");
        let file = tree.file("root/notes.txt", b"hi");
        let missing = tree.path().join("does-not-exist");

        let with_real = resolve_allowed(&text_of(&file), &[text_of(&missing), text_of(&root)]);
        assert!(with_real.is_ok());

        let only_missing = resolve_allowed(&text_of(&file), &[text_of(&missing)]);
        assert_eq!(
            only_missing.unwrap_err(),
            "None of the allowed folders could be found"
        );
    }

    #[test]
    fn missing_target_is_reported_as_not_found() {
        let tree = TempTree::new("paths-notfound");
        let root = tree.folder("root");
        let target = root.join("absent.txt");
        let result = resolve_allowed(&text_of(&target), &[text_of(&root)]);
        assert!(result.unwrap_err().starts_with("File or folder not found"));
    }

    #[cfg(windows)]
    #[test]
    fn refuses_a_hidden_file_inside_an_allowed_folder() {
        let tree = TempTree::new("paths-hidden");
        let root = tree.folder("root");
        let file = tree.file("root/secret.txt", b"hidden");
        if !set_hidden(&file) {
            return;
        }
        let result = resolve_allowed(&text_of(&file), &[text_of(&root)]);
        assert!(result.unwrap_err().contains("hidden or system"));
    }

    /// Try to create a file symlink. Returns false when the platform refuses (Windows needs a
    /// privilege for symlinks), so the test can skip.
    fn try_symlink_file(target: &Path, link: &Path) -> bool {
        #[cfg(windows)]
        let made = std::os::windows::fs::symlink_file(target, link).is_ok();
        #[cfg(not(windows))]
        let made = std::os::unix::fs::symlink(target, link).is_ok();
        made
    }

    #[cfg(windows)]
    fn set_hidden(path: &Path) -> bool {
        std::process::Command::new("attrib")
            .arg("+h")
            .arg(path)
            .status()
            .is_ok_and(|status| status.success())
    }
}

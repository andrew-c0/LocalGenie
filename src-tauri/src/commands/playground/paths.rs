//! Folders of the Playground, the names of generated images, and the checks on paths and job ids
//! that come from the webview.

use std::fs;
use std::path::{Path, PathBuf};

const MODELS_DIR: &str = "playground-models";
const PLAYGROUND_DIR: &str = "playground";
const IMAGES_DIR: &str = "images";
/// Folder under the app cache dir that holds microphone recordings.
const RECORDINGS_DIR: &str = "playground-audio";
/// The folder under Pictures and Music that generated images and speech are saved in.
const OUTPUT_FOLDER: &str = "LocalGenie";
const MAX_JOB_ID_CHARS: usize = 64;
/// How many characters of the prompt go into a file name.
const SLUG_CHARS: usize = 40;
/// Name used when the prompt has no letters or digits to make a slug from.
const FALLBACK_SLUG: &str = "image";
/// Highest `-n` suffix tried before giving up on a free file name.
const MAX_NAME_SUFFIX: u32 = 1000;

/// Where the curated model files are kept: `<app data>/playground-models`.
pub(super) fn models_root(data_dir: &Path) -> PathBuf {
    data_dir.join(MODELS_DIR)
}

/// Where images were written before they moved to Pictures: `<app data>/playground/images`. Kept so
/// earlier images still open.
pub(super) fn legacy_images_root(data_dir: &Path) -> PathBuf {
    data_dir.join(PLAYGROUND_DIR).join(IMAGES_DIR)
}

/// Where generated images are saved: `<Pictures>/LocalGenie`.
pub(super) fn output_folder(pictures_dir: &Path) -> PathBuf {
    pictures_dir.join(OUTPUT_FOLDER)
}

/// Where generated speech is saved: `<Music>/LocalGenie`.
pub(super) fn speech_output_folder(music_dir: &Path) -> PathBuf {
    music_dir.join(OUTPUT_FOLDER)
}

/// Where microphone recordings are kept until they are cleaned up: `<app cache>/playground-audio`.
pub(super) fn recordings_folder(cache_dir: &Path) -> PathBuf {
    cache_dir.join(RECORDINGS_DIR)
}

/// The file name of a generated image without its extension:
/// `<prompt slug>-<timestamp>-<seed>`, for example `a-red-fox-20261029-101112-42`.
pub(super) fn image_stem(prompt: &str, timestamp: &str, seed: i64) -> String {
    format!("{}-{timestamp}-{seed}", slug_from_prompt(prompt))
}

/// The first `SLUG_CHARS` characters of the prompt in lower case, with every run of other
/// characters replaced by one `-`. `image` when nothing is left.
pub(super) fn slug_from_prompt(prompt: &str) -> String {
    let head: String = prompt.chars().take(SLUG_CHARS).collect();
    let mut slug = String::with_capacity(head.len());
    for c in head.chars().flat_map(char::to_lowercase) {
        if c.is_ascii_alphanumeric() {
            slug.push(c);
        } else if !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let trimmed = slug.trim_matches('-');
    if trimmed.is_empty() {
        FALLBACK_SLUG.to_string()
    } else {
        trimmed.to_string()
    }
}

/// The path for a new PNG called `stem` in `folder`. See `free_path`.
pub(super) fn free_output_path(folder: &Path, stem: &str) -> Result<PathBuf, String> {
    free_path(folder, stem, "png")
}

/// The path for a new file called `stem.extension` in `folder`. A name that is taken gets `-2`,
/// `-3` and so on before the extension, so an existing file is never overwritten.
pub(super) fn free_path(folder: &Path, stem: &str, extension: &str) -> Result<PathBuf, String> {
    let first = folder.join(format!("{stem}.{extension}"));
    if !first.exists() {
        return Ok(first);
    }
    (2..=MAX_NAME_SUFFIX)
        .map(|suffix| folder.join(format!("{stem}-{suffix}.{extension}")))
        .find(|path| !path.exists())
        .ok_or_else(|| format!("No free file name for {stem} in {}", folder.display()))
}

/// A job id is used as an event id, so it may only hold letters, digits and `-`.
pub(super) fn validate_job_id(job_id: &str) -> Result<(), String> {
    let valid = !job_id.is_empty()
        && job_id.chars().count() <= MAX_JOB_ID_CHARS
        && job_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-');
    if valid {
        Ok(())
    } else {
        Err(format!("Invalid job id: {job_id}"))
    }
}

/// Resolve a path from the webview to a PNG inside one of `allowed_roots`. See `resolve_file_path`.
pub(super) fn resolve_image_path(raw: &str, allowed_roots: &[PathBuf]) -> Result<PathBuf, String> {
    resolve_file_path(raw, allowed_roots, "png")
}

/// Resolve a path from the webview to a file named `.extension` inside one of `allowed_roots`.
/// Symbolic links and `..` are resolved first, so a path that leaves the folders is refused. A root
/// that does not exist allows nothing.
pub(super) fn resolve_file_path(
    raw: &str,
    allowed_roots: &[PathBuf],
    extension: &str,
) -> Result<PathBuf, String> {
    let candidate = fs::canonicalize(raw).map_err(|_| format!("File not found: {raw}"))?;
    let inside_a_root = allowed_roots
        .iter()
        .filter_map(|root| fs::canonicalize(root).ok())
        .any(|root| candidate.starts_with(root));
    if !inside_a_root {
        return Err("Only files made by the Playground can be opened here.".to_string());
    }
    let has_extension = candidate
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case(extension));
    if !has_extension || !candidate.is_file() {
        return Err(format!(
            "Not a {} file: {raw}",
            extension.to_ascii_uppercase()
        ));
    }
    Ok(candidate)
}

/// The canonical form of `path`, when it exists and is inside `root` (not `root` itself). Symbolic
/// links and `..` are resolved first, so a link that points out of `root` is refused.
pub(super) fn contained_path(path: &Path, root: &Path) -> Result<PathBuf, String> {
    let canonical_root =
        fs::canonicalize(root).map_err(|e| format!("Cannot open {}: {e}", root.display()))?;
    let canonical =
        fs::canonicalize(path).map_err(|e| format!("Cannot open {}: {e}", path.display()))?;
    if canonical != canonical_root && canonical.starts_with(&canonical_root) {
        Ok(canonical)
    } else {
        Err(format!(
            "{} is outside the Playground's model folder.",
            path.display()
        ))
    }
}

/// A canonical Windows path starts with `\\?\`, which Explorer does not accept in `/select`.
/// The prefix is removed; the path is unchanged otherwise.
pub(super) fn without_verbatim_prefix(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(unc) = text.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{unc}"))
    } else if let Some(drive_path) = text.strip_prefix(r"\\?\") {
        PathBuf::from(drive_path)
    } else {
        path.to_path_buf()
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{try_file_link, Scratch};
    use super::*;

    #[test]
    fn job_ids_are_letters_digits_and_dashes_only() {
        for good in ["job-1", "3f2a9c1e-7b4d-4a8e-9f00-123456789abc", "A"] {
            assert!(validate_job_id(good).is_ok(), "{good} should pass");
        }
        let too_long = "a".repeat(65);
        for bad in [
            "",
            "../evil",
            "a/b",
            "a\\b",
            "a.b",
            "a b",
            "job_1",
            "a\0b",
            too_long.as_str(),
        ] {
            assert!(validate_job_id(bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn folders_are_legacy_images_under_app_data_and_output_under_pictures() {
        let legacy = legacy_images_root(Path::new("data"));
        assert!(legacy.ends_with(Path::new("playground").join("images")));
        assert!(models_root(Path::new("data")).ends_with("playground-models"));
        let output = output_folder(Path::new("pictures"));
        assert_eq!(output, Path::new("pictures").join("LocalGenie"));
    }

    #[test]
    fn slug_is_lower_case_words_joined_by_dashes() {
        assert_eq!(
            slug_from_prompt("A red fox, in the SNOW!"),
            "a-red-fox-in-the-snow"
        );
        assert_eq!(slug_from_prompt("Café  ☕ au lait"), "caf-au-lait");
        assert_eq!(slug_from_prompt("  --hello--  "), "hello");
    }

    #[test]
    fn slug_falls_back_to_image_when_nothing_is_left() {
        for empty in ["", "   ", "!!! ???", "☕☕"] {
            assert_eq!(slug_from_prompt(empty), "image", "{empty:?}");
        }
    }

    #[test]
    fn slug_takes_at_most_forty_characters_and_never_ends_in_a_dash() {
        let long = format!("{} tail words", "a".repeat(39));
        let slug = slug_from_prompt(&long);
        assert_eq!(slug, "a".repeat(39));
        assert_eq!(slug_from_prompt(&"b".repeat(100)).len(), SLUG_CHARS);
    }

    #[test]
    fn image_stem_joins_slug_timestamp_and_seed() {
        assert_eq!(
            image_stem("A fox", "20261029-101112", 42),
            "a-fox-20261029-101112-42"
        );
        assert_eq!(
            image_stem("   ", "20261029-101112", 0),
            "image-20261029-101112-0"
        );
    }

    #[test]
    fn a_taken_name_gets_a_counter_and_no_file_is_overwritten() {
        let scratch = Scratch::new("paths-free-name");
        let folder = scratch.path();
        let first = free_output_path(folder, "fox-20261029-101112-42").expect("first");
        assert_eq!(first, folder.join("fox-20261029-101112-42.png"));

        fs::write(&first, b"png").expect("first image");
        let second = free_output_path(folder, "fox-20261029-101112-42").expect("second");
        assert_eq!(second, folder.join("fox-20261029-101112-42-2.png"));

        fs::write(&second, b"png").expect("second image");
        let third = free_output_path(folder, "fox-20261029-101112-42").expect("third");
        assert_eq!(third, folder.join("fox-20261029-101112-42-3.png"));
    }

    #[test]
    fn only_pngs_inside_an_allowed_folder_resolve() {
        let scratch = Scratch::new("paths-contain");
        let root = scratch.path().join("LocalGenie");
        fs::create_dir_all(&root).expect("images dir");
        fs::write(root.join("a.png"), b"png").expect("png");
        fs::write(root.join("b.txt"), b"text").expect("txt");
        fs::write(scratch.path().join("outside.png"), b"png").expect("outside");
        let roots = [root.clone()];

        let inside = root.join("a.png");
        let resolved = resolve_image_path(&inside.to_string_lossy(), &roots).expect("inside");
        assert!(resolved.ends_with("a.png"));

        let escape = root.join("..").join("outside.png");
        assert!(resolve_image_path(&escape.to_string_lossy(), &roots).is_err());
        assert!(resolve_image_path(&root.join("b.txt").to_string_lossy(), &roots).is_err());
        assert!(resolve_image_path(&root.join("missing.png").to_string_lossy(), &roots).is_err());
        assert!(resolve_image_path(&root.to_string_lossy(), &roots).is_err());
    }

    #[test]
    fn either_allowed_folder_is_enough_and_others_are_refused() {
        let scratch = Scratch::new("paths-two-roots");
        let pictures = scratch.path().join("Pictures").join("LocalGenie");
        let legacy = scratch
            .path()
            .join("appdata")
            .join("playground")
            .join("images");
        let sibling = scratch.path().join("Pictures").join("LocalGenie2");
        for folder in [&pictures, &legacy, &sibling] {
            fs::create_dir_all(folder).expect("folder");
            fs::write(folder.join("img.png"), b"png").expect("png");
        }
        let roots = [pictures.clone(), legacy.clone()];

        assert!(resolve_image_path(&pictures.join("img.png").to_string_lossy(), &roots).is_ok());
        assert!(resolve_image_path(&legacy.join("img.png").to_string_lossy(), &roots).is_ok());
        assert!(resolve_image_path(&sibling.join("img.png").to_string_lossy(), &roots).is_err());
        let elsewhere = scratch.path().join("img.png");
        fs::write(&elsewhere, b"png").expect("elsewhere");
        assert!(resolve_image_path(&elsewhere.to_string_lossy(), &roots).is_err());
    }

    #[test]
    fn only_wavs_inside_an_allowed_folder_resolve_for_audio() {
        let scratch = Scratch::new("paths-audio");
        let speech = scratch.path().join("Music").join("LocalGenie");
        fs::create_dir_all(&speech).expect("speech folder");
        fs::write(speech.join("speech-hi-1.wav"), b"RIFF").expect("wav");
        fs::write(speech.join("notes.png"), b"png").expect("png");
        fs::write(scratch.path().join("outside.wav"), b"RIFF").expect("outside");
        let roots = [speech.clone()];

        let inside = speech.join("speech-hi-1.wav");
        assert!(resolve_file_path(&inside.to_string_lossy(), &roots, "wav").is_ok());
        assert!(
            resolve_file_path(&speech.join("notes.png").to_string_lossy(), &roots, "wav").is_err()
        );
        let escape = speech.join("..").join("..").join("outside.wav");
        assert!(resolve_file_path(&escape.to_string_lossy(), &roots, "wav").is_err());
        assert!(
            resolve_file_path(&inside.to_string_lossy(), &[], "wav").is_err(),
            "no roots"
        );
    }

    #[test]
    fn a_folder_with_no_files_of_the_extension_refuses_it() {
        let scratch = Scratch::new("paths-file-kind");
        let folder = scratch.path().join("recordings");
        fs::create_dir_all(&folder).expect("folder");
        assert!(resolve_file_path(
            &folder.to_string_lossy(),
            std::slice::from_ref(&folder),
            "wav"
        )
        .is_err());
    }

    #[test]
    fn missing_folders_refuse_every_path() {
        let scratch = Scratch::new("paths-no-root");
        let root = scratch.path().join("LocalGenie");
        assert!(resolve_image_path(&scratch.path().to_string_lossy(), &[root]).is_err());
        assert!(resolve_image_path(&scratch.path().to_string_lossy(), &[]).is_err());
    }

    #[test]
    fn a_path_is_contained_only_when_it_is_inside_the_root() {
        let scratch = Scratch::new("paths-contained");
        let root = scratch.path().join("playground-models");
        fs::create_dir_all(root.join("repo")).expect("repo folder");
        fs::write(root.join("repo").join("a.gguf"), b"gguf").expect("inside");
        fs::write(scratch.path().join("outside.gguf"), b"gguf").expect("outside");

        let inside = contained_path(&root.join("repo").join("a.gguf"), &root).expect("inside");
        assert!(inside.ends_with("a.gguf"));
        assert!(contained_path(
            &root.join("repo").join("..").join("..").join("outside.gguf"),
            &root
        )
        .is_err());
        assert!(contained_path(&scratch.path().join("outside.gguf"), &root).is_err());
        assert!(contained_path(&root, &root).is_err(), "the root itself");
        assert!(contained_path(&root.join("missing.gguf"), &root).is_err());
        let no_root = scratch.path().join("no-such-root");
        assert!(contained_path(&root.join("repo").join("a.gguf"), &no_root).is_err());
    }

    #[test]
    fn a_link_out_of_the_root_is_refused() {
        let scratch = Scratch::new("paths-link");
        let root = scratch.path().join("playground-models");
        fs::create_dir_all(&root).expect("root");
        let target = scratch.path().join("outside.gguf");
        fs::write(&target, b"gguf").expect("outside");
        let link = root.join("link.gguf");
        if !try_file_link(&target, &link) {
            return;
        }
        assert!(contained_path(&link, &root).is_err());
    }

    #[test]
    fn verbatim_prefix_is_removed_for_drive_and_unc_paths() {
        assert_eq!(
            without_verbatim_prefix(Path::new(r"\\?\C:\Users\me\a.png")),
            PathBuf::from(r"C:\Users\me\a.png")
        );
        assert_eq!(
            without_verbatim_prefix(Path::new(r"\\?\UNC\server\share\a.png")),
            PathBuf::from(r"\\server\share\a.png")
        );
        assert_eq!(
            without_verbatim_prefix(Path::new(r"C:\plain\a.png")),
            PathBuf::from(r"C:\plain\a.png")
        );
    }
}

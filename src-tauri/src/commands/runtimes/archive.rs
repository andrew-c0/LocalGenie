//! Unpacks a runtime archive (zip or tar.bz2) into a folder. Every entry path is checked before
//! anything is written: no absolute paths, drive prefixes, `..` or backslashes (zip-slip). Symbolic
//! and hard links are refused, and so is any entry that is neither a file nor a folder.

use std::ffi::OsString;
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

/// The archive formats a runtime can ship.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveFormat {
    Zip,
    TarBz2,
}

/// Unpack `archive` into `dest`, which is created when missing. With `strip_top_level`, the
/// archive's single top-level folder is dropped so its contents land directly in `dest`.
pub(super) fn extract(
    format: ArchiveFormat,
    archive: &Path,
    dest: &Path,
    strip_top_level: bool,
) -> Result<(), String> {
    match format {
        ArchiveFormat::Zip => extract_zip(archive, dest, strip_top_level),
        ArchiveFormat::TarBz2 => extract_tar_bz2(archive, dest, strip_top_level),
    }
}

/// Unpack a tar.bz2 into `dest`. Only regular files and folders are written; links and special
/// files fail the whole unpack. See the module docs for the path rules.
pub fn extract_tar_bz2(archive: &Path, dest: &Path, strip_top_level: bool) -> Result<(), String> {
    let not_valid =
        |e: &dyn std::fmt::Display| format!("The download is not a valid tar.bz2 archive: {e}");
    let file = fs::File::open(archive).map_err(|e| format!("Cannot open the download: {e}"))?;
    create_folder(dest)?;

    let mut tar = tar::Archive::new(bzip2::read::BzDecoder::new(file));
    let entries = tar.entries().map_err(|e| not_valid(&e))?;
    let mut unpacker = Unpacker::new(dest, strip_top_level);
    for entry in entries {
        let mut entry = entry.map_err(|e| not_valid(&e))?;
        let kind = entry.header().entry_type();
        // Global PAX headers carry metadata, not files.
        if kind.is_pax_global_extensions() {
            continue;
        }
        let name = entry_name(&entry)?;
        if kind.is_symlink() {
            return Err(format!("Archive entry is a symbolic link: {name}"));
        }
        if !(kind.is_file() || kind.is_dir()) {
            return Err(format!("Archive entry is not a file or folder: {name}"));
        }
        unpacker.write_entry(&name, kind.is_dir(), &mut entry)?;
    }
    Ok(())
}

/// Unpack a zip into `dest`. Every entry path is checked before anything is written, and symbolic
/// links are refused.
fn extract_zip(archive: &Path, dest: &Path, strip_top_level: bool) -> Result<(), String> {
    let file = fs::File::open(archive).map_err(|e| format!("Cannot open the download: {e}"))?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| format!("The download is not a valid zip archive: {e}"))?;
    create_folder(dest)?;

    let mut unpacker = Unpacker::new(dest, strip_top_level);
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|e| format!("Failed to read an archive entry: {e}"))?;
        let name = entry.name().to_string();
        if entry.is_symlink() {
            return Err(format!("Archive entry is a symbolic link: {name}"));
        }
        unpacker.write_entry(&name, entry.is_dir(), &mut entry)?;
    }
    Ok(())
}

/// Writes checked entries under one destination folder, with the top-level layout applied.
struct Unpacker<'a> {
    dest: &'a Path,
    layout: Layout,
}

impl<'a> Unpacker<'a> {
    fn new(dest: &'a Path, strip_top_level: bool) -> Self {
        Self {
            dest,
            layout: Layout::new(strip_top_level),
        }
    }

    /// Write one entry: a folder is created, a file is copied from `source`. An entry that the
    /// layout drops (the top-level folder itself) is skipped.
    fn write_entry<R: Read>(
        &mut self,
        name: &str,
        is_dir: bool,
        source: &mut R,
    ) -> Result<(), String> {
        let relative = archive_entry_path(name)?;
        let Some(placed) = self.layout.place(name, relative, is_dir)? else {
            return Ok(());
        };
        let out_path = self.dest.join(placed);
        if is_dir {
            create_folder(&out_path)
        } else {
            write_file(&out_path, source)
        }
    }
}

/// The name of a tar entry as text. A name that is not UTF-8 is refused.
fn entry_name<R: Read>(entry: &tar::Entry<'_, R>) -> Result<String, String> {
    let path = entry
        .path()
        .map_err(|e| format!("Failed to read an archive entry: {e}"))?;
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| format!("Unsafe path in the archive: {}", path.display()))
}

/// The path an archive entry unpacks to, relative to the destination. Rejects absolute paths,
/// drive prefixes, `..` and backslashes (zip-slip).
fn archive_entry_path(name: &str) -> Result<PathBuf, String> {
    let unsafe_entry = || format!("Unsafe path in the archive: {name}");
    if name.contains('\\') {
        return Err(unsafe_entry());
    }
    let mut relative = PathBuf::new();
    for component in Path::new(name).components() {
        match component {
            Component::Normal(part) => relative.push(part),
            Component::CurDir => {}
            _ => return Err(unsafe_entry()),
        }
    }
    if relative.as_os_str().is_empty() {
        return Err(unsafe_entry());
    }
    Ok(relative)
}

/// Where each entry lands. With `strip`, the archive's one top-level folder is dropped. An entry
/// outside that folder, or a second top-level folder, fails the unpack.
struct Layout {
    strip: bool,
    top: Option<OsString>,
}

impl Layout {
    fn new(strip: bool) -> Self {
        Self { strip, top: None }
    }

    /// The path under the destination for a checked entry. None means the entry is the top-level
    /// folder itself and nothing is written for it.
    fn place(
        &mut self,
        name: &str,
        relative: PathBuf,
        is_dir: bool,
    ) -> Result<Option<PathBuf>, String> {
        if !self.strip {
            return Ok(Some(relative));
        }
        let mut parts = relative.iter();
        let top = parts
            .next()
            .ok_or_else(|| format!("Unsafe path in the archive: {name}"))?;
        let seen = self.top.get_or_insert_with(|| top.to_os_string());
        if seen.as_os_str() != top {
            return Err(format!(
                "The archive has more than one top-level folder: {name}"
            ));
        }
        let inside: PathBuf = parts.collect();
        if !inside.as_os_str().is_empty() {
            return Ok(Some(inside));
        }
        if is_dir {
            Ok(None)
        } else {
            Err(format!(
                "The archive has a file outside its top-level folder: {name}"
            ))
        }
    }
}

fn create_folder(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| format!("Failed to create {}: {e}", path.display()))
}

/// Write `source` to `path`, creating the parent folders first.
fn write_file<R: Read>(path: &Path, source: &mut R) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        create_folder(parent)?;
    }
    let mut out =
        fs::File::create(path).map_err(|e| format!("Failed to create {}: {e}", path.display()))?;
    std::io::copy(source, &mut out)
        .and_then(|_| out.flush())
        .map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::super::test_support::Scratch;
    use super::*;

    /// Write a zip with the given entries (name, bytes) to `path`.
    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        use zip::write::SimpleFileOptions;
        let file = fs::File::create(path).expect("zip file");
        let mut writer = zip::ZipWriter::new(file);
        for (name, bytes) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .expect("start entry");
            writer.write_all(bytes).expect("write entry");
        }
        writer.finish().expect("finish zip");
    }

    /// One tar entry. Names are written raw, so tests can build hostile paths that the `tar`
    /// builder itself would refuse.
    enum Item<'a> {
        File(&'a str, &'a [u8]),
        Dir(&'a str),
        Symlink(&'a str, &'a str),
    }

    fn raw_header(name: &str, kind: tar::EntryType, size: u64) -> tar::Header {
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(kind);
        header.set_mode(0o644);
        header.set_size(size);
        let bytes = name.as_bytes();
        header.as_old_mut().name[..bytes.len()].copy_from_slice(bytes);
        header
    }

    /// Write a bzip2-compressed tar with `items` to `path`.
    fn write_tar_bz2(path: &Path, items: &[Item<'_>]) {
        let file = fs::File::create(path).expect("tar file");
        let encoder = bzip2::write::BzEncoder::new(file, bzip2::Compression::fast());
        let mut builder = tar::Builder::new(encoder);
        for item in items {
            match item {
                Item::File(name, body) => {
                    let mut header = raw_header(name, tar::EntryType::Regular, body.len() as u64);
                    header.set_cksum();
                    builder.append(&header, *body).expect("append file");
                }
                Item::Dir(name) => {
                    let mut header = raw_header(name, tar::EntryType::Directory, 0);
                    header.set_cksum();
                    builder
                        .append(&header, std::io::empty())
                        .expect("append dir");
                }
                Item::Symlink(name, target) => {
                    let mut header = raw_header(name, tar::EntryType::Symlink, 0);
                    let bytes = target.as_bytes();
                    header.as_old_mut().linkname[..bytes.len()].copy_from_slice(bytes);
                    header.set_cksum();
                    builder
                        .append(&header, std::io::empty())
                        .expect("append symlink");
                }
            }
        }
        builder.finish().expect("finish tar");
        builder
            .into_inner()
            .expect("tar writer")
            .finish()
            .expect("finish bz2");
    }

    #[test]
    fn archive_entries_must_stay_inside_the_destination() {
        assert_eq!(
            archive_entry_path("bin/sd-cli.exe").expect("safe"),
            Path::new("bin").join("sd-cli.exe")
        );
        assert!(archive_entry_path("./a.txt").is_ok());
        for bad in ["../x", "a/../../x", "/abs/x", "..\\x", "a\\..\\x", "", "./"] {
            assert!(
                archive_entry_path(bad).is_err(),
                "{bad:?} should be rejected"
            );
        }
    }

    #[test]
    fn zip_slip_entry_is_rejected_and_nothing_escapes() {
        let scratch = Scratch::new("zipslip");
        let archive = scratch.path().join("evil.zip");
        let dest = scratch.path().join("out");
        write_zip(
            &archive,
            &[("ok/sd-cli.exe", b"exe"), ("../escape.txt", b"x")],
        );

        assert!(extract(ArchiveFormat::Zip, &archive, &dest, false).is_err());
        assert!(
            !scratch.path().join("escape.txt").exists(),
            "entry wrote outside the destination"
        );
    }

    #[test]
    fn valid_zip_unpacks_with_its_folders() {
        let scratch = Scratch::new("unpack");
        let archive = scratch.path().join("ok.zip");
        let dest = scratch.path().join("out");
        write_zip(
            &archive,
            &[("sd-cli.exe", b"exe"), ("lib/ggml.dll", b"dll")],
        );

        extract(ArchiveFormat::Zip, &archive, &dest, false).expect("extracts");
        assert_eq!(fs::read(dest.join("sd-cli.exe")).expect("exe"), b"exe");
        assert_eq!(
            fs::read(dest.join("lib").join("ggml.dll")).expect("dll"),
            b"dll"
        );
    }

    #[test]
    fn tar_bz2_unpacks_keeping_its_folders() {
        let scratch = Scratch::new("tar-keep");
        let archive = scratch.path().join("ok.tar.bz2");
        let dest = scratch.path().join("out");
        write_tar_bz2(
            &archive,
            &[
                Item::Dir("top/"),
                Item::Dir("top/bin/"),
                Item::File("top/bin/tool.exe", b"exe"),
            ],
        );

        extract_tar_bz2(&archive, &dest, false).expect("extracts");
        assert_eq!(
            fs::read(dest.join("top").join("bin").join("tool.exe")).expect("exe"),
            b"exe"
        );
    }

    #[test]
    fn tar_bz2_strips_the_single_top_level_folder() {
        let scratch = Scratch::new("tar-strip");
        let archive = scratch.path().join("sherpa.tar.bz2");
        let dest = scratch.path().join("out");
        write_tar_bz2(
            &archive,
            &[
                Item::Dir("sherpa-top/"),
                Item::Dir("sherpa-top/bin/"),
                Item::File("sherpa-top/bin/sherpa-onnx-offline.exe", b"offline"),
                Item::File("sherpa-top/lib/onnxruntime.lib", b"lib"),
            ],
        );

        extract_tar_bz2(&archive, &dest, true).expect("extracts");
        assert_eq!(
            fs::read(dest.join("bin").join("sherpa-onnx-offline.exe")).expect("exe"),
            b"offline"
        );
        assert!(dest.join("lib").join("onnxruntime.lib").is_file());
        assert!(
            !dest.join("sherpa-top").exists(),
            "the top folder is dropped"
        );
    }

    #[test]
    fn strip_refuses_a_file_at_the_root_and_a_second_top_folder() {
        let scratch = Scratch::new("tar-strip-bad");
        let root_file = scratch.path().join("root.tar.bz2");
        let two_tops = scratch.path().join("two.tar.bz2");
        write_tar_bz2(&root_file, &[Item::File("README", b"hi")]);
        write_tar_bz2(
            &two_tops,
            &[Item::File("a/x.txt", b"a"), Item::File("b/y.txt", b"b")],
        );

        let dest = scratch.path().join("out-root");
        assert!(extract_tar_bz2(&root_file, &dest, true).is_err());
        let dest = scratch.path().join("out-two");
        assert!(extract_tar_bz2(&two_tops, &dest, true).is_err());
    }

    #[test]
    fn tar_bz2_rejects_traversal_and_absolute_paths_and_writes_nothing_outside() {
        let scratch = Scratch::new("tar-escape");
        let dest = scratch.path().join("out");
        let parent_escape = scratch.path().join("parent.tar.bz2");
        let absolute = scratch.path().join("absolute.tar.bz2");
        write_tar_bz2(
            &parent_escape,
            &[
                Item::File("ok/tool.exe", b"exe"),
                Item::File("ok/../../escape.txt", b"x"),
            ],
        );
        write_tar_bz2(&absolute, &[Item::File("/abs-escape.txt", b"x")]);

        for strip in [false, true] {
            let error = extract_tar_bz2(&parent_escape, &dest, strip).expect_err("`..` refused");
            assert!(error.starts_with("Unsafe path in the archive"), "{error}");
        }
        let error = extract_tar_bz2(&absolute, &dest, false).expect_err("absolute refused");
        assert!(error.starts_with("Unsafe path in the archive"), "{error}");
        assert!(!scratch.path().join("escape.txt").exists());
        assert!(!scratch.path().join("abs-escape.txt").exists());
    }

    #[test]
    fn tar_bz2_refuses_symbolic_links() {
        let scratch = Scratch::new("tar-link");
        let archive = scratch.path().join("link.tar.bz2");
        let dest = scratch.path().join("out");
        write_tar_bz2(
            &archive,
            &[
                Item::File("top/tool.exe", b"exe"),
                Item::Symlink("top/lib", "/etc"),
            ],
        );

        let error = extract_tar_bz2(&archive, &dest, true).expect_err("link refused");
        assert!(error.contains("symbolic link"), "{error}");
    }

    #[test]
    fn tar_bz2_refuses_a_file_that_is_not_an_archive() {
        let scratch = Scratch::new("tar-garbage");
        let archive = scratch.path().join("not.tar.bz2");
        fs::write(&archive, b"plain text, not bzip2").expect("write");
        let dest = scratch.path().join("out");
        assert!(extract_tar_bz2(&archive, &dest, true).is_err());
    }
}

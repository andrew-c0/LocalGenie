//! The sherpa-onnx programs in the current install: the offline speech recogniser, the offline
//! text-to-speech program, the speech denoiser and the source separator, all in the archive's `bin/`
//! folder. Callers get a clear error when the runtime is not installed or one of the programs is
//! missing.

use std::path::{Path, PathBuf};

use sea_orm::DatabaseConnection;

use super::current_install_dir;
use super::spec::SHERPA_ONNX;

/// The offline text-to-speech program, relative to the version folder. The recogniser's path is
/// the spec's `exe_relative_path`.
const TTS_RELATIVE: &str = "bin/sherpa-onnx-offline-tts.exe";
/// The speech denoiser, relative to the version folder.
const DENOISER_RELATIVE: &str = "bin/sherpa-onnx-offline-denoiser.exe";
/// The source separator, relative to the version folder.
const SEPARATION_RELATIVE: &str = "bin/sherpa-onnx-offline-source-separation.exe";

/// The `bin/` folder of a sherpa-onnx install and the programs in it.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SherpaPrograms {
    pub(crate) bin_dir: PathBuf,
    pub(crate) offline: PathBuf,
    pub(crate) tts: PathBuf,
    pub(crate) denoiser: PathBuf,
    pub(crate) separation: PathBuf,
}

/// The programs of the current sherpa-onnx install. Fails with "sherpa-onnx is not installed" when
/// there is no install, or with the same message naming the file when one program is missing.
pub(crate) async fn sherpa_programs(db: &DatabaseConnection) -> Result<SherpaPrograms, String> {
    let install = current_install_dir(db, &SHERPA_ONNX)
        .await?
        .ok_or_else(not_installed)?;
    programs_in(&install)
}

/// The programs in a version folder. Each must be a file.
fn programs_in(install: &Path) -> Result<SherpaPrograms, String> {
    let programs = SherpaPrograms {
        bin_dir: install.join("bin"),
        offline: SHERPA_ONNX.exe_path(install),
        tts: install.join(TTS_RELATIVE),
        denoiser: install.join(DENOISER_RELATIVE),
        separation: install.join(SEPARATION_RELATIVE),
    };
    for program in [
        &programs.offline,
        &programs.tts,
        &programs.denoiser,
        &programs.separation,
    ] {
        if !program.is_file() {
            return Err(program_missing(program));
        }
    }
    Ok(programs)
}

/// The error when there is no install at all.
fn not_installed() -> String {
    format!("{} is not installed", SHERPA_ONNX.display_name)
}

/// The error when an install is missing one of its programs.
fn program_missing(program: &Path) -> String {
    format!(
        "{} is not installed: {} is missing",
        SHERPA_ONNX.display_name,
        program.display()
    )
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::super::test_support::Scratch;
    use super::*;

    /// Write the four programs of an install into its `bin/` folder, except those in `skip`.
    fn write_programs(install: &Path, skip: &[&str]) {
        let bin = install.join("bin");
        fs::create_dir_all(&bin).expect("bin");
        for name in [
            "sherpa-onnx-offline.exe",
            "sherpa-onnx-offline-tts.exe",
            "sherpa-onnx-offline-denoiser.exe",
            "sherpa-onnx-offline-source-separation.exe",
        ] {
            if !skip.contains(&name) {
                fs::write(bin.join(name), b"exe").expect("program");
            }
        }
    }

    #[test]
    fn all_four_programs_are_found_in_bin() {
        let scratch = Scratch::new("sherpa-ok");
        write_programs(scratch.path(), &[]);
        let bin = scratch.path().join("bin");

        let programs = programs_in(scratch.path()).expect("installed");
        assert_eq!(programs.bin_dir, bin);
        assert_eq!(programs.offline, bin.join("sherpa-onnx-offline.exe"));
        assert_eq!(programs.tts, bin.join("sherpa-onnx-offline-tts.exe"));
        assert_eq!(
            programs.denoiser,
            bin.join("sherpa-onnx-offline-denoiser.exe")
        );
        assert_eq!(
            programs.separation,
            bin.join("sherpa-onnx-offline-source-separation.exe")
        );
    }

    #[test]
    fn a_missing_program_is_reported_as_not_installed() {
        let scratch = Scratch::new("sherpa-partial");
        write_programs(scratch.path(), &["sherpa-onnx-offline-tts.exe"]);

        let error = programs_in(scratch.path()).expect_err("tts is missing");
        assert!(error.starts_with("sherpa-onnx is not installed"), "{error}");
        assert!(error.contains("sherpa-onnx-offline-tts.exe"), "{error}");
    }

    #[test]
    fn a_missing_denoiser_or_separator_is_reported_by_name() {
        for missing in [
            "sherpa-onnx-offline-denoiser.exe",
            "sherpa-onnx-offline-source-separation.exe",
        ] {
            let scratch = Scratch::new("sherpa-audio-missing");
            write_programs(scratch.path(), &[missing]);
            let error = programs_in(scratch.path()).expect_err("one is missing");
            assert!(error.starts_with("sherpa-onnx is not installed"), "{error}");
            assert!(error.contains(missing), "{error}");
        }
    }

    #[test]
    fn no_install_says_not_installed() {
        assert_eq!(not_installed(), "sherpa-onnx is not installed");
    }
}

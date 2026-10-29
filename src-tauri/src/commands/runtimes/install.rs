//! Download, verify and extract a runtime release into `<runtimes>/<id>/<version>/`.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

use serde::Serialize;

use super::archive;
use super::release::{Release, ReleaseAsset};
use super::spec::RuntimeSpec;
use crate::commands::download::{
    stream_to_partial, validate_file_name, Transfer, TransferProgress,
};

/// Where an install is in its steps. Serialised as the `stage` of `runtime-install-progress`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InstallStage {
    Checking,
    Downloading,
    Verifying,
    Extracting,
    Done,
    Error,
}

/// One `runtime-install-progress` event. `received` and `total` are 0 when there is no byte count.
#[derive(Debug, Clone, Serialize)]
pub struct InstallProgress {
    pub id: String,
    pub stage: InstallStage,
    pub received: u64,
    pub total: u64,
    pub message: String,
}

/// Receives each progress event. `Sync` so the reference can live across the await points.
pub(super) type Reporter<'a> = &'a (dyn Fn(InstallProgress) + Sync);

/// A version that is now on disk and recorded as current.
#[derive(Debug, Clone, PartialEq)]
pub struct InstalledVersion {
    pub version: String,
    pub install_dir: PathBuf,
    pub sha256: String,
    pub source_url: String,
}

/// Download `release`'s archive for `spec`, check it, and unpack it into a new version folder.
/// Older version folders are kept, so rolling back stays possible. `report` gets each stage.
pub(super) async fn install_release(
    client: &reqwest::Client,
    cancel: &AtomicBool,
    runtimes_root: &Path,
    spec: &RuntimeSpec,
    release: &Release,
    report: Reporter<'_>,
) -> Result<InstalledVersion, String> {
    validate_version(&release.tag)?;
    let asset = spec.pick_asset(release).ok_or_else(|| {
        format!(
            "Release {} has no {} archive",
            release.tag, spec.display_name
        )
    })?;
    if !is_runtime_download_url(&asset.download_url, spec.repo) {
        return Err(format!(
            "Refusing to download from {}: not a release of {}",
            asset.download_url, spec.repo
        ));
    }

    let runtime_dir = runtimes_root.join(spec.id);
    let archive = download_archive(client, cancel, &runtime_dir, spec, asset, report).await?;

    stage_report(
        report,
        spec,
        InstallStage::Verifying,
        "Checking the download",
    );
    let actual = hash_file(&archive).await;
    let verified =
        actual.and_then(|hash| verify_sha256(&hash, asset.sha256.as_deref()).map(|()| hash));
    let sha256 = match verified {
        Ok(hash) => hash,
        Err(e) => {
            let _ = fs::remove_file(&archive);
            return Err(e);
        }
    };

    stage_report(
        report,
        spec,
        InstallStage::Extracting,
        "Unpacking the runtime",
    );
    let install_dir = runtime_dir.join(&release.tag);
    let staging = runtime_dir.join(format!(".staging-{}", release.tag));
    let unpacked = unpack_into_place(&archive, &staging, &install_dir, spec).await;
    let _ = fs::remove_file(&archive);
    if let Err(e) = unpacked {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }

    Ok(InstalledVersion {
        version: release.tag.clone(),
        install_dir,
        sha256,
        source_url: asset.download_url.clone(),
    })
}

/// Stream the asset into `<runtime_dir>/downloads/<asset name>`, resuming a partial file if one exists.
async fn download_archive(
    client: &reqwest::Client,
    cancel: &AtomicBool,
    runtime_dir: &Path,
    spec: &RuntimeSpec,
    asset: &ReleaseAsset,
    report: Reporter<'_>,
) -> Result<PathBuf, String> {
    validate_file_name(&asset.name)?;
    let downloads = runtime_dir.join("downloads");
    fs::create_dir_all(&downloads)
        .map_err(|e| format!("Failed to create {}: {e}", downloads.display()))?;
    let archive = downloads.join(&asset.name);
    let partial = downloads.join(format!("{}.part", asset.name));

    let on_progress = |progress: TransferProgress| {
        report(InstallProgress {
            id: spec.id.to_string(),
            stage: InstallStage::Downloading,
            received: progress.received,
            total: progress.total.unwrap_or(0),
            message: format!("Downloading {}", asset.name),
        })
    };
    match stream_to_partial(
        client,
        &asset.download_url,
        &partial,
        Some(cancel),
        on_progress,
    )
    .await?
    {
        Transfer::Finished(_) => {
            fs::rename(&partial, &archive)
                .map_err(|e| format!("Failed to finalise the download: {e}"))?;
            Ok(archive)
        }
        Transfer::Cancelled => Err("The runtime download was cancelled".to_string()),
    }
}

/// Unpack `archive` into `staging`, check the program is there, then move it to `install_dir`.
async fn unpack_into_place(
    download: &Path,
    staging: &Path,
    install_dir: &Path,
    spec: &RuntimeSpec,
) -> Result<(), String> {
    let (download_owned, staging_owned) = (download.to_path_buf(), staging.to_path_buf());
    let (format, strip) = (spec.archive, spec.strip_top_level);
    tokio::task::spawn_blocking(move || {
        let _ = fs::remove_dir_all(&staging_owned);
        archive::extract(format, &download_owned, &staging_owned, strip)
    })
    .await
    .map_err(|e| format!("Unpacking stopped unexpectedly: {e}"))??;

    if !spec.exe_path(staging).is_file() {
        return Err(format!(
            "The archive does not contain {}",
            spec.exe_relative_path
        ));
    }
    if install_dir.exists() {
        fs::remove_dir_all(install_dir)
            .map_err(|e| format!("Failed to replace {}: {e}", install_dir.display()))?;
    }
    fs::rename(staging, install_dir).map_err(|e| format!("Failed to place the runtime: {e}"))
}

/// Remove every installed version of a runtime and its downloads. The caller forgets the row.
pub(super) fn remove_runtime_files(runtimes_root: &Path, spec: &RuntimeSpec) -> Result<(), String> {
    let runtime_dir = runtimes_root.join(spec.id);
    if !runtime_dir.exists() {
        return Ok(());
    }
    fs::remove_dir_all(&runtime_dir)
        .map_err(|e| format!("Failed to remove {}: {e}", runtime_dir.display()))
}

fn stage_report(report: Reporter<'_>, spec: &RuntimeSpec, stage: InstallStage, message: &str) {
    report(InstallProgress {
        id: spec.id.to_string(),
        stage,
        received: 0,
        total: 0,
        message: message.to_string(),
    });
}

/// A version tag as a folder name: letters, digits, `.`, `-` and `_`, no leading dot.
pub(super) fn validate_version(version: &str) -> Result<(), String> {
    let valid = !version.is_empty()
        && version.len() <= 64
        && !version.starts_with('.')
        && version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    if valid {
        Ok(())
    } else {
        Err(format!("Invalid runtime version: {version}"))
    }
}

/// True for a download URL under the repo's release downloads. The trailing slash keeps a
/// look-alike repo name (`<repo>-evil`) out.
pub(super) fn is_runtime_download_url(url: &str, repo: &str) -> bool {
    url.starts_with(&format!("https://github.com/{repo}/releases/download/"))
}

/// Compare the hash of the downloaded file with GitHub's digest. No digest from GitHub means
/// nothing to compare, so the check passes.
pub(super) fn verify_sha256(actual: &str, expected: Option<&str>) -> Result<(), String> {
    match expected {
        Some(expected) if !actual.eq_ignore_ascii_case(expected) => Err(format!(
            "The download does not match the release checksum (expected {expected}, got {actual})"
        )),
        _ => Ok(()),
    }
}

async fn hash_file(path: &Path) -> Result<String, String> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || sha256_of_file(&path))
        .await
        .map_err(|e| format!("Checksum stopped unexpectedly: {e}"))?
}

/// SHA-256 of a file, as lower-case hex, read in 64 KiB blocks.
fn sha256_of_file(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let mut file = fs::File::open(path).map_err(|e| format!("Cannot read the download: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buf)
            .map_err(|e| format!("Cannot read the download: {e}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::super::test_support::Scratch;
    use super::*;

    #[test]
    fn version_must_be_a_safe_folder_name() {
        assert!(validate_version("master-1024-77b72a2").is_ok());
        assert!(validate_version("1.2.3").is_ok());
        let too_long = "v".repeat(65);
        for bad in ["", "..", ".hidden", "a/b", "a\\b", "x y", too_long.as_str()] {
            assert!(validate_version(bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn download_url_must_be_under_the_repo_release_downloads() {
        let repo = "andrew-c0/localgenie-runtimes";
        let good = "https://github.com/andrew-c0/localgenie-runtimes/releases/download/t/a.zip";
        assert!(is_runtime_download_url(good, repo));
        for bad in [
            "http://github.com/andrew-c0/localgenie-runtimes/releases/download/t/a.zip",
            "https://github.com/andrew-c0/localgenie-runtimes-evil/releases/download/t/a.zip",
            "https://github.com/andrew-c0/localgenie-runtimes/archive/t.zip",
            "https://evil.example/github.com/andrew-c0/localgenie-runtimes/releases/download/t/a.zip",
            "https://huggingface.co/owner/repo/resolve/main/model.gguf",
        ] {
            assert!(!is_runtime_download_url(bad, repo), "{bad} should be rejected");
        }
    }

    #[test]
    fn digest_must_match_when_github_gives_one() {
        let hash = "ab12";
        assert!(
            verify_sha256(hash, None).is_ok(),
            "no digest means nothing to compare"
        );
        assert!(
            verify_sha256(hash, Some("AB12")).is_ok(),
            "hex compare ignores case"
        );
        assert!(verify_sha256(hash, Some("cd34")).is_err());
    }

    #[test]
    fn sha256_of_a_file_matches_the_known_digest() {
        let scratch = Scratch::new("sha");
        let file = scratch.path().join("abc.bin");
        fs::write(&file, b"abc").expect("write");
        assert_eq!(
            sha256_of_file(&file).expect("hash"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}

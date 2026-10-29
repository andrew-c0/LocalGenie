//! Static descriptions of the optional runtimes: where their releases live and what the archive holds.

use std::path::{Path, PathBuf};

use super::release::{parse_release_list, Release, ReleaseAsset};

/// Our fork of stable-diffusion.cpp. Upstream ships no Windows ARM64 build, so the fork's release
/// workflow publishes one. A runtime with an official ARM64 release points at the official repo
/// instead; a runtime without one gets its own fork or repo.
pub const SD_CPP_REPO: &str = "andrew-c0/stable-diffusion.cpp";

/// One optional runtime the app can install.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RuntimeSpec {
    /// Stable id used in commands, the database and the folder name.
    pub id: &'static str,
    pub display_name: &'static str,
    /// GitHub `owner/name` that publishes the archives.
    pub repo: &'static str,
    /// Every part must appear in the asset name.
    pub asset_contains: &'static [&'static str],
    /// The asset name must end with this.
    pub asset_suffix: &'static str,
    /// Path of the program inside an installed version folder.
    pub exe_relative_path: &'static str,
}

/// stable-diffusion.cpp, built for Windows ARM64 by the fork's release workflow.
pub const SD_CPP: RuntimeSpec = RuntimeSpec {
    id: "sd-cpp",
    display_name: "stable-diffusion.cpp",
    repo: SD_CPP_REPO,
    asset_contains: &["sd", "windows-arm64"],
    asset_suffix: ".zip",
    exe_relative_path: "sd-cli.exe",
};

/// Every runtime the app knows about, in display order.
pub const RUNTIME_SPECS: &[RuntimeSpec] = &[SD_CPP];

/// The spec with this id, or an error naming the unknown id.
pub fn find_spec(id: &str) -> Result<&'static RuntimeSpec, String> {
    RUNTIME_SPECS
        .iter()
        .find(|spec| spec.id == id)
        .ok_or_else(|| format!("Unknown runtime: {id}"))
}

impl RuntimeSpec {
    /// True when an asset name is this runtime's archive.
    pub fn matches_asset(&self, name: &str) -> bool {
        self.asset_contains.iter().all(|part| name.contains(part))
            && name.ends_with(self.asset_suffix)
    }

    /// The archive asset of a release, if it has one.
    pub fn pick_asset<'a>(&self, release: &'a Release) -> Option<&'a ReleaseAsset> {
        release
            .assets
            .iter()
            .find(|asset| self.matches_asset(&asset.name))
    }

    /// The newest release in a GitHub release list (see `parse_release_list`) that has this
    /// runtime's archive. Upstream may publish builds for other platforms as the latest release,
    /// so the first release without an archive is passed over.
    pub fn newest_release(&self, list_json: &serde_json::Value) -> Result<Release, String> {
        parse_release_list(list_json, self.repo)?
            .into_iter()
            .find(|release| self.pick_asset(release).is_some())
            .ok_or_else(|| format!("No release of {} has a Windows ARM64 build yet.", self.repo))
    }

    /// Where the program sits inside a version folder.
    pub fn exe_path(&self, version_dir: &Path) -> PathBuf {
        version_dir.join(self.exe_relative_path)
    }
}

#[cfg(test)]
mod tests {
    use super::super::release::parse_release;
    use super::*;

    fn release_with(names: &[&str]) -> Release {
        let assets: Vec<serde_json::Value> = names
            .iter()
            .map(|name| {
                serde_json::json!({
                    "name": name,
                    "browser_download_url": format!("https://github.com/x/y/releases/download/t/{name}")
                })
            })
            .collect();
        parse_release(
            &serde_json::json!({ "tag_name": "t", "assets": assets }),
            SD_CPP_REPO,
        )
        .expect("release parses")
    }

    #[test]
    fn picks_the_arm64_zip_only() {
        let release = release_with(&[
            "sd-master-1024-77b72a2-win-cpu-x64.zip",
            "sd-master-1024-77b72a2-windows-arm64.exe",
            "sd-master-1024-77b72a2-windows-arm64.zip",
        ]);
        let picked = SD_CPP.pick_asset(&release).expect("asset found");
        assert_eq!(picked.name, "sd-master-1024-77b72a2-windows-arm64.zip");
    }

    #[test]
    fn no_asset_when_only_other_platforms_are_listed() {
        let release = release_with(&["sd-master-win-cpu-x64.zip", "notes.txt"]);
        assert!(SD_CPP.pick_asset(&release).is_none());
    }

    /// One entry of a release list, shaped like GitHub's `GET /repos/{repo}/releases` response.
    fn github_release(
        tag: &str,
        published_at: &str,
        (draft, prerelease): (bool, bool),
        asset_names: &[&str],
    ) -> serde_json::Value {
        let assets: Vec<serde_json::Value> = asset_names
            .iter()
            .map(|name| {
                serde_json::json!({
                    "name": name,
                    "browser_download_url": format!("https://github.com/andrew-c0/stable-diffusion.cpp/releases/download/{tag}/{name}"),
                    "digest": format!("sha256:{}", "a".repeat(64)),
                    "content_type": "application/zip",
                    "state": "uploaded"
                })
            })
            .collect();
        serde_json::json!({
            "url": format!("https://api.github.com/repos/andrew-c0/stable-diffusion.cpp/releases/{tag}"),
            "html_url": format!("https://github.com/andrew-c0/stable-diffusion.cpp/releases/tag/{tag}"),
            "tag_name": tag,
            "draft": draft,
            "prerelease": prerelease,
            "created_at": published_at,
            "published_at": published_at,
            "assets": assets
        })
    }

    const X64_ONLY: &str = "sd-master-591-4d2b1d0-win-cpu-x64.zip";
    const ARM64: &str = "sd-master-1024-77b72a2-windows-arm64.zip";

    #[test]
    fn newer_x64_only_release_is_passed_over_for_an_older_arm64_build() {
        // Upstream's x64-only release is the GitHub "Latest"; the fork's ARM64 build is older.
        let list = serde_json::json!([
            github_release(
                "master-1030-aaaaaaa",
                "2026-10-20T09:00:00Z",
                (false, false),
                &[X64_ONLY]
            ),
            github_release(
                "master-1024-77b72a2",
                "2026-10-10T09:00:00Z",
                (false, false),
                &[ARM64]
            ),
        ]);
        let release = SD_CPP.newest_release(&list).expect("an ARM64 release");
        assert_eq!(release.tag, "master-1024-77b72a2");
        assert_eq!(SD_CPP.pick_asset(&release).expect("asset").name, ARM64);
    }

    #[test]
    fn several_arm64_releases_pick_the_newest() {
        // The list is out of order on purpose: the newest publish time wins, not the first entry.
        let list = serde_json::json!([
            github_release(
                "master-1010-bbbbbbb",
                "2026-10-05T09:00:00Z",
                (false, false),
                &[ARM64]
            ),
            github_release(
                "master-1030-aaaaaaa",
                "2026-10-20T09:00:00Z",
                (false, false),
                &[X64_ONLY]
            ),
            github_release(
                "master-1020-ccccccc",
                "2026-10-15T09:00:00Z",
                (false, false),
                &[
                    "sd-master-1020-ccccccc-windows-arm64.zip",
                    "sd-master-1020-ccccccc-windows-arm64.exe",
                ]
            ),
            github_release(
                "master-1000-ddddddd",
                "2026-09-30T09:00:00Z",
                (false, false),
                &[ARM64]
            ),
        ]);
        let release = SD_CPP.newest_release(&list).expect("an ARM64 release");
        assert_eq!(release.tag, "master-1020-ccccccc");
    }

    #[test]
    fn draft_and_prerelease_arm64_builds_are_skipped() {
        let list = serde_json::json!([
            github_release(
                "master-1040-eeeeeee",
                "2026-10-25T09:00:00Z",
                (true, false),
                &[ARM64]
            ),
            github_release(
                "master-1035-fffffff",
                "2026-10-22T09:00:00Z",
                (false, true),
                &[ARM64]
            ),
            github_release(
                "master-1024-77b72a2",
                "2026-10-10T09:00:00Z",
                (false, false),
                &[ARM64]
            ),
        ]);
        let release = SD_CPP.newest_release(&list).expect("an ARM64 release");
        assert_eq!(release.tag, "master-1024-77b72a2");
    }

    #[test]
    fn error_when_no_release_has_an_arm64_build() {
        let list = serde_json::json!([
            github_release(
                "master-1030-aaaaaaa",
                "2026-10-20T09:00:00Z",
                (false, false),
                &[X64_ONLY]
            ),
            github_release(
                "master-1029-bbbbbbb",
                "2026-10-19T09:00:00Z",
                (false, false),
                &["sd-master-1029-bbbbbbb-windows-arm64.exe", "notes.txt",]
            ),
        ]);
        assert_eq!(
            SD_CPP.newest_release(&list),
            Err(
                "No release of andrew-c0/stable-diffusion.cpp has a Windows ARM64 build yet."
                    .to_string()
            )
        );
    }

    #[test]
    fn empty_release_list_is_the_same_error() {
        assert!(SD_CPP.newest_release(&serde_json::json!([])).is_err());
    }

    #[test]
    fn finds_spec_by_id_and_rejects_unknown_ids() {
        assert_eq!(find_spec("sd-cpp").map(|s| s.repo), Ok(SD_CPP_REPO));
        assert!(find_spec("../etc").is_err());
    }

    #[test]
    fn exe_is_resolved_inside_the_version_folder() {
        let dir = Path::new("base").join("sd-cpp").join("1.0");
        assert_eq!(SD_CPP.exe_path(&dir), dir.join("sd-cli.exe"));
    }
}

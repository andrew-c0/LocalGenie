//! Static descriptions of the optional runtimes: where their releases live and what the archive holds.

use std::path::{Path, PathBuf};

use super::release::{Release, ReleaseAsset};

/// GitHub repository that publishes the runtime archives. Change this one line to move the source.
pub const RUNTIMES_REPO: &str = "andrew-c0/localgenie-runtimes";

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

/// stable-diffusion.cpp, built for Windows ARM64 by our own runtimes release.
pub const SD_CPP: RuntimeSpec = RuntimeSpec {
    id: "sd-cpp",
    display_name: "stable-diffusion.cpp",
    repo: RUNTIMES_REPO,
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
            RUNTIMES_REPO,
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

    #[test]
    fn finds_spec_by_id_and_rejects_unknown_ids() {
        assert_eq!(find_spec("sd-cpp").map(|s| s.repo), Ok(RUNTIMES_REPO));
        assert!(find_spec("../etc").is_err());
    }

    #[test]
    fn exe_is_resolved_inside_the_version_folder() {
        let dir = Path::new("base").join("sd-cpp").join("1.0");
        assert_eq!(SD_CPP.exe_path(&dir), dir.join("sd-cli.exe"));
    }
}

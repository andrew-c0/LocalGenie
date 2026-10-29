//! The compute devices stable-diffusion.cpp can run on, from `sd-cli --list-devices`: the parser for
//! its output, the kind of each device, the check that a chosen device is one of them, and the
//! `--backend` value a request gets (the CPU when no device is chosen).

use std::path::Path;
use std::time::Duration;

use serde::Serialize;
use tokio::time::timeout;

use super::args::AUTO_DEVICE;
use super::program;
use super::progress::plain_text;

const LIST_DEVICES_TIMEOUT: Duration = Duration::from_secs(15);
/// Lower-case name prefixes of the CPU backend.
const CPU_PREFIX: &str = "cpu";
/// Lower-case name prefixes of the Hexagon NPU backend (HTP).
const NPU_PREFIXES: &[&str] = &["htp", "hexagon"];
/// Lower-case name prefixes of the GPU backends.
const GPU_PREFIXES: &[&str] = &["opencl", "vulkan", "cuda", "metal", "sycl", "rocm", "gpu"];

/// One device line of `sd-cli --list-devices`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SdDevice {
    /// The name `--backend` takes, such as `CPU` or `GPUOpenCL0`.
    pub name: String,
    pub description: String,
    pub kind: DeviceKind,
}

/// What kind of processor a device is, read from the start of its name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceKind {
    Cpu,
    Gpu,
    Npu,
    Other,
}

/// The kind of the device called `name`. The match ignores case.
pub(super) fn device_kind(name: &str) -> DeviceKind {
    let lower = name.to_ascii_lowercase();
    let starts_with_any =
        |prefixes: &[&str]| prefixes.iter().any(|prefix| lower.starts_with(prefix));
    if lower.starts_with(CPU_PREFIX) {
        DeviceKind::Cpu
    } else if starts_with_any(NPU_PREFIXES) {
        DeviceKind::Npu
    } else if starts_with_any(GPU_PREFIXES) {
        DeviceKind::Gpu
    } else {
        DeviceKind::Other
    }
}

/// The devices in `--list-devices` output. Each device is a `name<TAB>description` line. Log lines
/// (starting with `[`) and lines without a tab are skipped.
pub(super) fn parse_devices(output: &str) -> Vec<SdDevice> {
    output.lines().filter_map(parse_device_line).collect()
}

fn parse_device_line(line: &str) -> Option<SdDevice> {
    let text = plain_text(line);
    if text.trim_start().starts_with('[') {
        return None;
    }
    let (name, description) = text.split_once('\t')?;
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    Some(SdDevice {
        name: name.to_string(),
        description: description.trim().to_string(),
        kind: device_kind(name),
    })
}

/// Run `sd-cli --list-devices` and parse what it prints. Stops after 15 seconds; the process is
/// killed then.
pub(super) async fn list_devices(program: &Path) -> Result<Vec<SdDevice>, String> {
    let mut command = program::command(program, program::folder_of(program)?);
    command.arg("--list-devices");
    let output = timeout(LIST_DEVICES_TIMEOUT, command.output())
        .await
        .map_err(|_| "Listing the devices took longer than 15 seconds.".to_string())?
        .map_err(|e| format!("Failed to start stable-diffusion.cpp: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "stable-diffusion.cpp could not list its devices ({}).",
            output.status
        ));
    }
    // The device lines may come on either pipe; log lines are skipped by the parser.
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(parse_devices(&text))
}

/// The `--backend` value for a request's device. Runs `--list-devices` once, then picks with
/// `pick_backend`.
pub(super) async fn resolve_backend(
    program: &Path,
    device: Option<&str>,
) -> Result<Option<String>, String> {
    let listed = list_devices(program).await;
    pick_backend(listed, device)
}

/// The `--backend` value for a request, from the devices sd-cli lists. An explicit device must be
/// one of them, or the request fails with the list's error. A missing or `auto` device runs on the
/// CPU: the name of the first CPU device listed. When the list could not be read or has no CPU
/// device, it is None and sd-cli chooses, as it did before.
pub(super) fn pick_backend(
    listed: Result<Vec<SdDevice>, String>,
    device: Option<&str>,
) -> Result<Option<String>, String> {
    match device.filter(|name| *name != AUTO_DEVICE) {
        Some(name) => {
            let devices = listed?;
            ensure_listed(&devices, name)?;
            Ok(Some(name.to_string()))
        }
        None => Ok(listed.ok().and_then(|devices| cpu_device_name(&devices))),
    }
}

/// The name of the first CPU device in `devices`, the value `--backend` takes.
fn cpu_device_name(devices: &[SdDevice]) -> Option<String> {
    devices
        .iter()
        .find(|device| device.kind == DeviceKind::Cpu)
        .map(|device| device.name.clone())
}

/// Fails unless `name` is the name of one of `devices`. The message says what to do.
pub(super) fn ensure_listed(devices: &[SdDevice], name: &str) -> Result<(), String> {
    if devices.iter().any(|device| device.name == name) {
        Ok(())
    } else {
        Err(format!(
            "{name} is not a device stable-diffusion.cpp lists on this computer. Pick a device from the list."
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real CPU line, and invented GPU and NPU lines, with log lines around them.
    const SAMPLE_OUTPUT: &str = "[INFO] loading backends\n\
        CPU\tSnapdragon(R) X Elite - X1E78100 - Qualcomm(R) Oryon(TM) CPU\n\
        GPUOpenCL0\tQualcomm Adreno X1-85\n\
        HTP0\tHexagon NPU\n\
        [WARN] ignored\n";

    #[test]
    fn parses_each_device_line_and_skips_log_lines() {
        let devices = parse_devices(SAMPLE_OUTPUT);
        assert_eq!(
            devices,
            vec![
                SdDevice {
                    name: "CPU".to_string(),
                    description: "Snapdragon(R) X Elite - X1E78100 - Qualcomm(R) Oryon(TM) CPU"
                        .to_string(),
                    kind: DeviceKind::Cpu,
                },
                SdDevice {
                    name: "GPUOpenCL0".to_string(),
                    description: "Qualcomm Adreno X1-85".to_string(),
                    kind: DeviceKind::Gpu,
                },
                SdDevice {
                    name: "HTP0".to_string(),
                    description: "Hexagon NPU".to_string(),
                    kind: DeviceKind::Npu,
                },
            ]
        );
    }

    #[test]
    fn kind_follows_the_name_prefix_ignoring_case() {
        let cases = [
            ("CPU", DeviceKind::Cpu),
            ("cpu", DeviceKind::Cpu),
            ("HTP0", DeviceKind::Npu),
            ("htp1", DeviceKind::Npu),
            ("Hexagon", DeviceKind::Npu),
            ("GPUOpenCL0", DeviceKind::Gpu),
            ("Vulkan1", DeviceKind::Gpu),
            ("CUDA0", DeviceKind::Gpu),
            ("Metal", DeviceKind::Gpu),
            ("SYCL0", DeviceKind::Gpu),
            ("ROCm0", DeviceKind::Gpu),
            ("gpu", DeviceKind::Gpu),
            ("Accel0", DeviceKind::Other),
            ("xcpu", DeviceKind::Other),
        ];
        for (name, kind) in cases {
            assert_eq!(device_kind(name), kind, "{name}");
        }
    }

    #[test]
    fn lines_without_a_usable_name_are_skipped() {
        let output =
            "no tab on this line\n\tdescription without a name\n   \t \n[I] CPU\tlog line\n";
        assert!(parse_devices(output).is_empty());
    }

    #[test]
    fn crlf_line_endings_and_escape_codes_are_removed() {
        let output = "CPU\tOne core\r\n\u{1b}[32mGPUVulkan0\u{1b}[0m\tAdreno\r\n";
        let devices = parse_devices(output);
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].name, "CPU");
        assert_eq!(devices[0].description, "One core");
        assert_eq!(devices[1].name, "GPUVulkan0");
        assert_eq!(devices[1].description, "Adreno");
    }

    #[test]
    fn a_device_with_an_empty_description_is_kept() {
        let devices = parse_devices("CPU\t\n");
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].description, "");
    }

    #[test]
    fn only_a_listed_device_name_passes_and_the_match_is_exact() {
        let devices = parse_devices(SAMPLE_OUTPUT);
        assert!(ensure_listed(&devices, "HTP0").is_ok());
        assert!(ensure_listed(&devices, "htp0").is_err());
        assert!(ensure_listed(&devices, "CUDA0").is_err());
        assert!(ensure_listed(&[], "CPU").is_err());
    }

    /// The list `SAMPLE_OUTPUT` parses to: a CPU, a GPU and an NPU.
    fn sample_list() -> Result<Vec<SdDevice>, String> {
        Ok(parse_devices(SAMPLE_OUTPUT))
    }

    #[test]
    fn a_missing_or_auto_device_runs_on_the_listed_cpu() {
        assert_eq!(
            pick_backend(sample_list(), None),
            Ok(Some("CPU".to_string()))
        );
        assert_eq!(
            pick_backend(sample_list(), Some(AUTO_DEVICE)),
            Ok(Some("CPU".to_string()))
        );
    }

    #[test]
    fn the_cpu_is_found_by_kind_not_by_list_position() {
        let listed = Ok(vec![
            SdDevice {
                name: "GPUOpenCL0".to_string(),
                description: "Adreno".to_string(),
                kind: DeviceKind::Gpu,
            },
            SdDevice {
                name: "cpu1".to_string(),
                description: "Second CPU".to_string(),
                kind: DeviceKind::Cpu,
            },
        ]);
        assert_eq!(pick_backend(listed, None), Ok(Some("cpu1".to_string())));
    }

    #[test]
    fn auto_falls_back_to_no_backend_when_there_is_no_cpu_or_no_list() {
        let gpu_only = Ok(parse_devices("GPUOpenCL0\tAdreno\n"));
        assert_eq!(pick_backend(gpu_only, None), Ok(None));
        assert_eq!(pick_backend(Ok(Vec::new()), None), Ok(None));
        let unreadable = Err("could not list".to_string());
        assert_eq!(pick_backend(unreadable, Some(AUTO_DEVICE)), Ok(None));
    }

    #[test]
    fn a_listed_explicit_device_is_used_as_chosen() {
        assert_eq!(
            pick_backend(sample_list(), Some("GPUOpenCL0")),
            Ok(Some("GPUOpenCL0".to_string()))
        );
        assert_eq!(
            pick_backend(sample_list(), Some("HTP0")),
            Ok(Some("HTP0".to_string()))
        );
    }

    #[test]
    fn an_explicit_device_must_be_listed_or_the_request_fails() {
        assert!(pick_backend(sample_list(), Some("CUDA0")).is_err());
        assert!(pick_backend(sample_list(), Some("cpu")).is_err());
    }

    #[test]
    fn an_explicit_device_fails_with_the_list_error_when_the_list_is_unreadable() {
        let unreadable = Err("could not list".to_string());
        assert_eq!(
            pick_backend(unreadable, Some("CPU")),
            Err("could not list".to_string())
        );
    }

    #[test]
    fn device_serialises_with_the_camel_case_contract() {
        let json = serde_json::to_value(&parse_devices(SAMPLE_OUTPUT)[2]).expect("json");
        assert_eq!(json["name"], "HTP0");
        assert_eq!(json["description"], "Hexagon NPU");
        assert_eq!(json["kind"], "npu");
    }
}

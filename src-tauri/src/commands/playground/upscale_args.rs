//! The request and the sd-cli command line for one upscaling job. Upscaling is a fixed 4x with the
//! model's `.pth` file read directly. Only the CPU is offered: the GPU backend crashes.

use std::path::Path;

use serde::Deserialize;

/// How much the picture grows on each side. Both curated models are 4x.
pub(super) const UPSCALE_FACTOR: u32 = 4;
/// The longest side an input may have, in pixels. A larger picture is refused, not scaled.
pub(super) const MAX_INPUT_EDGE: u32 = 1024;

/// What the webview asks for: one picture enlarged with one curated upscaler.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleRequest {
    pub job_id: String,
    pub model_id: String,
    /// The picture to enlarge. Its path is checked by `input_image` before use.
    pub input_path: String,
}

/// Refuses a picture whose longest side is over `MAX_INPUT_EDGE`, or that has no pixels.
pub(super) fn check_input_size(width: u32, height: u32) -> Result<(), String> {
    if width == 0 || height == 0 {
        return Err("The image has no pixels.".to_string());
    }
    if width.max(height) > MAX_INPUT_EDGE {
        return Err(format!(
            "The image is {width} x {height} px. Upscaling takes at most {MAX_INPUT_EDGE} px on the longest side. Shrink it first, then try again."
        ));
    }
    Ok(())
}

/// The size of the result for an input of `width` x `height`.
pub(super) fn upscaled_size(width: u32, height: u32) -> (u32, u32) {
    (
        width.saturating_mul(UPSCALE_FACTOR),
        height.saturating_mul(UPSCALE_FACTOR),
    )
}

/// The sd-cli arguments that enlarge `input` with the model file `model`, writing a PNG to
/// `output`. `backend` is the CPU device from `devices::resolve_backend`, or None to leave the
/// choice to sd-cli (only when the device list has no CPU).
pub(super) fn upscale_args(
    model: &Path,
    input: &Path,
    output: &Path,
    backend: Option<&str>,
) -> Vec<String> {
    let mut args = vec![
        "-M".to_string(),
        "upscale".to_string(),
        "-i".to_string(),
        input.to_string_lossy().into_owned(),
        "--upscale-model".to_string(),
        model.to_string_lossy().into_owned(),
        "-o".to_string(),
        output.to_string_lossy().into_owned(),
    ];
    if let Some(device) = backend {
        args.push("--backend".to_string());
        args.push(device.to_string());
    }
    args
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn the_arguments_are_mode_input_model_output_and_the_cpu_backend() {
        let model = PathBuf::from("models").join("a.pth");
        let out = PathBuf::from("out").join("up.png");
        let args = upscale_args(&model, Path::new("in.png"), &out, Some("CPU"));
        let model_text = model.to_string_lossy().into_owned();
        let out_text = out.to_string_lossy().into_owned();
        assert_eq!(
            args,
            [
                "-M",
                "upscale",
                "-i",
                "in.png",
                "--upscale-model",
                model_text.as_str(),
                "-o",
                out_text.as_str(),
                "--backend",
                "CPU",
            ]
        );
    }

    #[test]
    fn no_cpu_device_means_no_backend_flag() {
        let args = upscale_args(
            Path::new("a.pth"),
            Path::new("in.png"),
            Path::new("o.png"),
            None,
        );
        assert!(!args.iter().any(|arg| arg == "--backend"));
        assert_eq!(args.last().map(String::as_str), Some("o.png"));
    }

    #[test]
    fn the_longest_side_is_capped_at_1024_inclusive() {
        assert!(check_input_size(1024, 1024).is_ok());
        assert!(check_input_size(1024, 10).is_ok());
        assert!(check_input_size(1, 1).is_ok());
        for (w, h) in [(1025, 10), (10, 1025), (4000, 3000)] {
            let message = check_input_size(w, h).expect_err("too large");
            assert!(message.contains("Shrink it first"), "{message}");
            assert!(message.contains(&format!("{w} x {h}")), "{message}");
        }
        assert!(check_input_size(0, 10).is_err());
    }

    #[test]
    fn the_result_is_four_times_the_input() {
        assert_eq!(upscaled_size(256, 100), (1024, 400));
        assert_eq!(upscaled_size(u32::MAX, 1), (u32::MAX, 4));
    }

    #[test]
    fn request_reads_the_camel_case_contract() {
        let request: UpscaleRequest = serde_json::from_value(serde_json::json!({
            "jobId": "job-1",
            "modelId": "nomos2-hq-mosr-x4",
            "inputPath": "C:\\pictures\\cow.png"
        }))
        .expect("parses");
        assert_eq!(request.job_id, "job-1");
        assert_eq!(request.model_id, "nomos2-hq-mosr-x4");
        assert_eq!(request.input_path, "C:\\pictures\\cow.png");
    }
}

//! What the webview asks for in an audio to audio job, and the sherpa-onnx argument lists the job runs
//! with. The model files come from the model's folder, and the input and outputs are the paths the
//! job checked, so nothing from the request reaches a path that is not checked first.

use std::path::Path;

use serde::Deserialize;

use super::audio_catalog::{DenoiseEngine, SeparateEngine};
use super::speech_args::NUM_THREADS;

/// `playground_enhance_audio`: a WAV file to clean up or split with a denoise or separate model.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnhanceRequest {
    pub job_id: String,
    pub model_id: String,
    pub audio_path: String,
}

/// The arguments for `sherpa-onnx-offline-denoiser` that clean `input` with the denoiser in
/// `model_dir`, writing a WAV to `output`. Each option is `--name=value`.
pub(super) fn denoise_args(
    engine: DenoiseEngine,
    model_dir: &Path,
    input: &Path,
    output: &Path,
) -> Vec<String> {
    let model = model_dir.join(engine.model_file()).display().to_string();
    let model_flag = match engine {
        DenoiseEngine::Gtcrn { .. } => "--speech-denoiser-gtcrn-model",
        DenoiseEngine::DpdfNet { .. } => "--speech-denoiser-dpdfnet-model",
    };
    vec![
        format!("{model_flag}={model}"),
        format!("--num-threads={NUM_THREADS}"),
        format!("--input-wav={}", input.display()),
        format!("--output-wav={}", output.display()),
    ]
}

/// The arguments for `sherpa-onnx-offline-source-separation` that split `input` with the Spleeter
/// models in `model_dir`, writing the voice and the accompaniment as WAV files.
pub(super) fn separate_args(
    engine: SeparateEngine,
    model_dir: &Path,
    input: &Path,
    voice: &Path,
    music: &Path,
) -> Vec<String> {
    let [vocals, accompaniment] = engine.model_files();
    vec![
        format!("--spleeter-vocals={}", model_dir.join(vocals).display()),
        format!(
            "--spleeter-accompaniment={}",
            model_dir.join(accompaniment).display()
        ),
        format!("--num-threads={NUM_THREADS}"),
        format!("--input-wav={}", input.display()),
        format!("--output-vocals-wav={}", voice.display()),
        format!("--output-accompaniment-wav={}", music.display()),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::playground::speech_catalog::{find_recipe, Engine};

    /// A Windows model folder and input, as the app sees them.
    const MODEL_DIR: &str =
        r"C:\Users\me\AppData\Roaming\LocalGenie\playground-models\k2-fsa--sherpa-onnx\dpdfnet4";

    fn denoise_engine(id: &str) -> DenoiseEngine {
        match find_recipe(id).expect("recipe").engine {
            Engine::Denoise(engine) => engine,
            _ => panic!("{id} is not a denoiser"),
        }
    }

    fn separate_engine(id: &str) -> SeparateEngine {
        match find_recipe(id).expect("recipe").engine {
            Engine::Separate(engine) => engine,
            _ => panic!("{id} is not a separator"),
        }
    }

    #[test]
    fn gtcrn_arguments_are_the_exact_list() {
        let dir = Path::new(r"C:\models\gtcrn-simple");
        let args = denoise_args(
            denoise_engine("gtcrn-simple"),
            dir,
            Path::new(r"C:\clips\speech_with_noise.wav"),
            Path::new(r"C:\Music\LocalGenie\clean-speech-20261030-101112.wav"),
        );
        assert_eq!(
            args,
            vec![
                format!(
                    "--speech-denoiser-gtcrn-model={}",
                    dir.join("gtcrn_simple.onnx").display()
                ),
                "--num-threads=4".to_string(),
                r"--input-wav=C:\clips\speech_with_noise.wav".to_string(),
                r"--output-wav=C:\Music\LocalGenie\clean-speech-20261030-101112.wav".to_string(),
            ]
        );
    }

    #[test]
    fn dpdfnet_arguments_use_its_own_flag_and_leave_the_attenuation_unset() {
        let dir = Path::new(MODEL_DIR);
        let args = denoise_args(
            denoise_engine("dpdfnet4"),
            dir,
            Path::new(r"C:\clips\a.wav"),
            Path::new(r"C:\out\b.wav"),
        );
        assert_eq!(
            args,
            vec![
                format!(
                    "--speech-denoiser-dpdfnet-model={}",
                    dir.join("dpdfnet4.onnx").display()
                ),
                "--num-threads=4".to_string(),
                r"--input-wav=C:\clips\a.wav".to_string(),
                r"--output-wav=C:\out\b.wav".to_string(),
            ]
        );
        assert!(
            args.iter().all(|arg| !arg.contains("attenuation-limit")),
            "the attenuation limit is left to the program's default"
        );
    }

    #[test]
    fn spleeter_arguments_are_the_exact_list_with_both_outputs() {
        let dir = Path::new(r"C:\models\spleeter-2stems-int8");
        let args = separate_args(
            separate_engine("spleeter-2stems-int8"),
            dir,
            Path::new(r"C:\clips\audio_example.wav"),
            Path::new(r"C:\Music\LocalGenie\voice-audio-example-20261030-101112.wav"),
            Path::new(r"C:\Music\LocalGenie\music-audio-example-20261030-101112.wav"),
        );
        assert_eq!(
            args,
            vec![
                format!(
                    "--spleeter-vocals={}",
                    dir.join("vocals.int8.onnx").display()
                ),
                format!(
                    "--spleeter-accompaniment={}",
                    dir.join("accompaniment.int8.onnx").display()
                ),
                "--num-threads=4".to_string(),
                r"--input-wav=C:\clips\audio_example.wav".to_string(),
                r"--output-vocals-wav=C:\Music\LocalGenie\voice-audio-example-20261030-101112.wav"
                    .to_string(),
                r"--output-accompaniment-wav=C:\Music\LocalGenie\music-audio-example-20261030-101112.wav"
                    .to_string(),
            ]
        );
    }

    #[test]
    fn a_dash_in_the_input_name_stays_inside_its_option() {
        let args = denoise_args(
            denoise_engine("gtcrn-simple"),
            Path::new("m"),
            Path::new("-odd.wav"),
            Path::new("o.wav"),
        );
        assert!(args.contains(&"--input-wav=-odd.wav".to_string()));
    }

    #[test]
    fn requests_deserialise_from_the_camel_case_the_webview_sends() {
        let request: EnhanceRequest = serde_json::from_value(serde_json::json!({
            "jobId": "job-3",
            "modelId": "spleeter-2stems-int8",
            "audioPath": "C:\\clips\\mix.wav"
        }))
        .expect("enhance");
        assert_eq!(request.job_id, "job-3");
        assert_eq!(request.model_id, "spleeter-2stems-int8");
        assert_eq!(request.audio_path, "C:\\clips\\mix.wav");
    }
}

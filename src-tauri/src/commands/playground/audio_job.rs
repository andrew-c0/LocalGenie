//! Plans an audio to audio job: the sherpa-onnx program, its arguments and the WAV files it writes.
//! The outputs are named from the input's file name and the time, in the speech output folder, and a
//! name that is taken gets a counter so no file is replaced.

use std::path::{Path, PathBuf};

use super::audio_args::{denoise_args, separate_args};
use super::paths;
use super::speech_args::WAV_EXTENSION;
use super::speech_catalog::{self, Engine, SpeechRecipe};
use super::speech_job::{AudioOutput, SpeechJob};
use crate::commands::runtimes::sherpa_cli::SherpaPrograms;

/// The label of the denoised speech.
const CLEANED_LABEL: &str = "Cleaned speech";
/// The label of the voice a separator finds.
const VOICE_LABEL: &str = "Voice";
/// The label of everything else a separator finds.
const MUSIC_LABEL: &str = "Music and other sounds";

/// The job that runs `recipe` on `input` and writes its outputs into `folder`. `timestamp` goes into
/// each output name. Fails when the recipe is not an audio model.
pub(super) fn enhance_job(
    job_id: &str,
    recipe: &SpeechRecipe,
    models_root: &Path,
    programs: SherpaPrograms,
    input: PathBuf,
    folder: &Path,
    timestamp: &str,
) -> Result<SpeechJob, String> {
    let model_dir = speech_catalog::model_dir(models_root, recipe);
    let slug = paths::slug_from_file_stem(&input);
    let stem = |prefix: &str| format!("{prefix}-{slug}-{timestamp}");
    let (program, args, outputs) = match recipe.engine {
        Engine::Denoise(engine) => {
            let clean = paths::free_path(folder, &stem("clean"), WAV_EXTENSION)?;
            let args = denoise_args(engine, &model_dir, &input, &clean);
            let outputs = vec![AudioOutput {
                label: CLEANED_LABEL,
                path: clean,
            }];
            (programs.denoiser, args, outputs)
        }
        Engine::Separate(engine) => {
            let voice = paths::free_path(folder, &stem("voice"), WAV_EXTENSION)?;
            let music = paths::free_path(folder, &stem("music"), WAV_EXTENSION)?;
            let args = separate_args(engine, &model_dir, &input, &voice, &music);
            let outputs = vec![
                AudioOutput {
                    label: VOICE_LABEL,
                    path: voice,
                },
                AudioOutput {
                    label: MUSIC_LABEL,
                    path: music,
                },
            ];
            (programs.separation, args, outputs)
        }
        Engine::Stt(_) | Engine::Tts(_) => {
            return Err(format!("{} is not an audio to audio model.", recipe.name))
        }
    };
    Ok(SpeechJob {
        job_id: job_id.to_string(),
        kind: recipe.kind(),
        program,
        folder: programs.bin_dir,
        args,
        audio: input,
        outputs,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::super::speech_catalog::{find_recipe, SpeechKind};
    use super::super::test_support::Scratch;
    use super::*;

    fn programs(install: &Path) -> SherpaPrograms {
        let bin = install.join("bin");
        SherpaPrograms {
            bin_dir: bin.clone(),
            offline: bin.join("sherpa-onnx-offline.exe"),
            tts: bin.join("sherpa-onnx-offline-tts.exe"),
            denoiser: bin.join("sherpa-onnx-offline-denoiser.exe"),
            separation: bin.join("sherpa-onnx-offline-source-separation.exe"),
        }
    }

    #[test]
    fn a_denoise_job_writes_one_clean_file_named_from_the_input() {
        let scratch = Scratch::new("audio-job-denoise");
        let recipe = find_recipe("gtcrn-simple").expect("recipe");
        let job = enhance_job(
            "job-9",
            recipe,
            scratch.path(),
            programs(scratch.path()),
            PathBuf::from(r"C:\clips\Speech With Noise.wav"),
            scratch.path(),
            "20261030-101112",
        )
        .expect("job");

        assert_eq!(job.job_id, "job-9");
        assert_eq!(job.kind, SpeechKind::Denoise);
        assert_eq!(job.program, programs(scratch.path()).denoiser);
        assert_eq!(job.folder, programs(scratch.path()).bin_dir);
        assert_eq!(job.audio, PathBuf::from(r"C:\clips\Speech With Noise.wav"));
        assert_eq!(
            job.outputs,
            vec![AudioOutput {
                label: "Cleaned speech",
                path: scratch
                    .path()
                    .join("clean-speech-with-noise-20261030-101112.wav"),
            }]
        );
        assert!(job
            .args
            .contains(&format!("--output-wav={}", job.outputs[0].path.display())));
    }

    #[test]
    fn a_separate_job_writes_a_voice_and_a_music_file_in_that_order() {
        let scratch = Scratch::new("audio-job-separate");
        let recipe = find_recipe("spleeter-2stems-int8").expect("recipe");
        let job = enhance_job(
            "job-10",
            recipe,
            scratch.path(),
            programs(scratch.path()),
            PathBuf::from(r"C:\clips\audio_example.wav"),
            scratch.path(),
            "20261030-101112",
        )
        .expect("job");

        assert_eq!(job.kind, SpeechKind::Separate);
        assert_eq!(job.program, programs(scratch.path()).separation);
        let labels: Vec<&str> = job.outputs.iter().map(|output| output.label).collect();
        assert_eq!(labels, vec!["Voice", "Music and other sounds"]);
        assert_eq!(
            job.outputs[0].path,
            scratch
                .path()
                .join("voice-audio-example-20261030-101112.wav")
        );
        assert_eq!(
            job.outputs[1].path,
            scratch
                .path()
                .join("music-audio-example-20261030-101112.wav")
        );
    }

    #[test]
    fn a_taken_output_name_gets_a_counter_and_is_not_overwritten() {
        let scratch = Scratch::new("audio-job-taken");
        let taken = scratch.path().join("clean-clip-20261030-101112.wav");
        fs::write(&taken, b"RIFF").expect("existing");
        let recipe = find_recipe("gtcrn-simple").expect("recipe");
        let job = enhance_job(
            "job-11",
            recipe,
            scratch.path(),
            programs(scratch.path()),
            PathBuf::from("clip.wav"),
            scratch.path(),
            "20261030-101112",
        )
        .expect("job");

        assert_eq!(
            job.outputs[0].path,
            scratch.path().join("clean-clip-20261030-101112-2.wav")
        );
        assert_eq!(fs::read(&taken).expect("kept"), b"RIFF");
    }

    #[test]
    fn a_speech_model_is_not_an_audio_job() {
        let scratch = Scratch::new("audio-job-speech");
        let recipe = find_recipe("whisper-tiny-en").expect("recipe");
        let error = enhance_job(
            "job-12",
            recipe,
            scratch.path(),
            programs(scratch.path()),
            PathBuf::from("clip.wav"),
            scratch.path(),
            "20261030-101112",
        )
        .expect_err("speech to text");
        assert!(error.contains("not an audio to audio model"), "{error}");
    }
}

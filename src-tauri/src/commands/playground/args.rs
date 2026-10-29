//! The sd-cli command line for one image: the model flags from the recipe, then the request.

use std::hash::{BuildHasher, Hasher, RandomState};
use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::catalog::{ImageInput, ImageRecipe, ModelRole};
use super::devices::{device_kind, DeviceKind};

const MIN_EDGE: u32 = 64;
const MAX_EDGE: u32 = 2048;
/// Width and height must be a multiple of this, as the latent grid needs it.
const EDGE_STEP: u32 = 8;
const MAX_STEPS: u32 = 150;
const MAX_CFG_SCALE: f32 = 30.0;
const MAX_PROMPT_CHARS: usize = 2000;
const MAX_DEVICE_CHARS: usize = 40;
/// The device value that asks for the default, the same as sending no device: the CPU.
pub(super) const AUTO_DEVICE: &str = "auto";
/// The share of the steps an init image runs: 0.05 keeps most of the picture, 1.0 starts from noise.
const MIN_STRENGTH: f32 = 0.05;
const MAX_STRENGTH: f32 = 1.0;
/// The strength an init image uses when the request gives none.
pub(super) const DEFAULT_STRENGTH: f32 = 0.6;
/// The sampler a reference edit runs with, the one the verified FLUX.2 klein edit used.
const REFERENCE_SAMPLER: &str = "euler";

/// What the webview asks for: one image from one curated model, optionally from an input picture.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRequest {
    pub job_id: String,
    pub model_id: String,
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub width: u32,
    pub height: u32,
    pub steps: u32,
    pub cfg_scale: f32,
    /// A seed of -1 asks for a random one.
    pub seed: i64,
    /// A device name from `playground_list_devices`. Missing or `auto` runs on the CPU device.
    pub device: Option<String>,
    /// The picture to start from or to edit. Its path is checked by `input_image` before use.
    pub input_path: Option<String>,
    /// How far an init image is changed. Used only with an init image; see `DEFAULT_STRENGTH`.
    pub strength: Option<f32>,
}

impl ImageRequest {
    /// The same request with a random seed in place of -1. Any other seed is kept.
    pub(super) fn with_resolved_seed(self) -> Self {
        let seed = if self.seed >= 0 {
            self.seed
        } else {
            random_seed()
        };
        Self { seed, ..self }
    }
}

/// A seed in 0..2^31, from the randomly keyed std hasher. Not for security, just variety.
fn random_seed() -> i64 {
    let hash = RandomState::new().build_hasher().finish();
    // Shifting a u64 right by 33 leaves 31 bits, which always fits an i64.
    i64::try_from(hash >> 33).unwrap_or(0)
}

/// Reject a request the model cannot render, before any process is started.
pub(super) fn validate_request(request: &ImageRequest) -> Result<(), String> {
    if request.prompt.trim().is_empty() {
        return Err("Enter a prompt first.".to_string());
    }
    if request.prompt.chars().count() > MAX_PROMPT_CHARS {
        return Err(format!(
            "The prompt is longer than {MAX_PROMPT_CHARS} characters."
        ));
    }
    let negative_chars = request
        .negative_prompt
        .as_deref()
        .map_or(0, |text| text.chars().count());
    if negative_chars > MAX_PROMPT_CHARS {
        return Err(format!(
            "The negative prompt is longer than {MAX_PROMPT_CHARS} characters."
        ));
    }
    for (name, edge) in [("Width", request.width), ("Height", request.height)] {
        let in_range = (MIN_EDGE..=MAX_EDGE).contains(&edge);
        if !in_range || edge % EDGE_STEP != 0 {
            return Err(format!(
                "{name} must be a multiple of {EDGE_STEP} between {MIN_EDGE} and {MAX_EDGE}."
            ));
        }
    }
    if !(1..=MAX_STEPS).contains(&request.steps) {
        return Err(format!("Steps must be between 1 and {MAX_STEPS}."));
    }
    if !request.cfg_scale.is_finite() || !(0.0..=MAX_CFG_SCALE).contains(&request.cfg_scale) {
        return Err(format!("CFG scale must be between 0 and {MAX_CFG_SCALE}."));
    }
    if request.seed < -1 {
        return Err("The seed must be -1 (random) or a number from 0 up.".to_string());
    }
    validate_device_name(request.device.as_deref())
}

/// Checks the input picture against the model. A request with no input picture is text-to-image and
/// is never refused here. A model with no input support refuses one. A reference edit ignores the
/// strength. An init image needs a strength between `MIN_STRENGTH` and `MAX_STRENGTH`, or the default.
pub(super) fn validate_input_for_model(
    recipe: &ImageRecipe,
    request: &ImageRequest,
) -> Result<(), String> {
    if request.input_path.is_none() {
        return Ok(());
    }
    match recipe.image_input {
        ImageInput::None => Err(format!(
            "{} cannot take an input image. Pick a model that can.",
            recipe.name
        )),
        ImageInput::Reference => Ok(()),
        ImageInput::Init => {
            let strength = init_strength(request);
            if (MIN_STRENGTH..=MAX_STRENGTH).contains(&strength) {
                Ok(())
            } else {
                Err(format!(
                    "Strength must be between {MIN_STRENGTH} and {MAX_STRENGTH}."
                ))
            }
        }
    }
}

/// The strength an init image runs with: the request's, or `DEFAULT_STRENGTH` when it gives none.
fn init_strength(request: &ImageRequest) -> f32 {
    request.strength.unwrap_or(DEFAULT_STRENGTH)
}

/// Accept a missing device, or a name of letters, digits, `_`, `.` and `-` up to 40 characters.
/// The name is only a shape check; the caller checks it against the devices sd-cli lists.
pub(super) fn validate_device_name(device: Option<&str>) -> Result<(), String> {
    let Some(name) = device else {
        return Ok(());
    };
    let valid = !name.is_empty()
        && name.chars().count() <= MAX_DEVICE_CHARS
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'));
    if valid {
        Ok(())
    } else {
        Err(format!("Invalid device name: {name}"))
    }
}

/// The sd-cli arguments that render `request` with `recipe`, writing a PNG to `output_path`.
/// `model_paths` gives the local path of each role. A role with no path gets no flag, so the
/// caller checks the files are on disk first. A model that does not take a negative prompt or a
/// CFG scale gets neither from the request. `backend` is the device for `--backend`, or None to
/// leave the choice to sd-cli (only when the device list has no CPU, see `devices::pick_backend`).
/// `input` is the checked input picture, if the request has one (see `push_input_args`).
/// `--batched-cfg off` is passed for an init image on any device, and for a GPU or NPU device: the
/// batched CFG forward renders a blank white image on the Adreno OpenCL backend whenever the CFG
/// scale is above 1. The CPU and the no-device case keep sd-cli's default.
pub(super) fn build_args(
    recipe: &ImageRecipe,
    model_paths: &[(ModelRole, PathBuf)],
    request: &ImageRequest,
    output_path: &Path,
    backend: Option<&str>,
    input: Option<&Path>,
) -> Vec<String> {
    let mut args = Vec::new();
    for &(flag, role) in recipe.flags {
        if let Some((_, path)) = model_paths.iter().find(|(path_role, _)| *path_role == role) {
            push_pair(&mut args, flag, path.to_string_lossy());
        }
    }
    if let Some(path) = input {
        push_input_args(&mut args, recipe.image_input, path, request);
    }
    push_pair(&mut args, "-p", &request.prompt);
    if recipe.supports_negative_prompt {
        if let Some(negative) = effective_negative_prompt(request) {
            push_pair(&mut args, "-n", negative);
        }
    }
    push_pair(&mut args, "-W", request.width);
    push_pair(&mut args, "-H", request.height);
    push_pair(&mut args, "--steps", request.steps);
    let cfg_scale = if recipe.cfg_adjustable {
        request.cfg_scale
    } else {
        recipe.defaults.cfg_scale
    };
    push_pair(&mut args, "--cfg-scale", cfg_scale);
    if request.seed >= 0 {
        push_pair(&mut args, "--seed", request.seed);
    }
    // `--backend` applies to every module with no assignment of its own (docs/backend.md), so the
    // text encoder runs on the same device. No module is pinned to the CPU.
    if let Some(device) = backend {
        push_pair(&mut args, "--backend", device);
    }
    if needs_batched_cfg_off(recipe.image_input, input.is_some(), backend) {
        push_pair(&mut args, "--batched-cfg", "off");
    }
    push_pair(&mut args, "-t", thread_count());
    push_pair(&mut args, "-o", output_path.to_string_lossy());
    args
}

/// The flags for the input picture. An init image gets `-i` and `--strength`. A reference image gets
/// `-r`, and a reference edit samples with Euler. A model with no input support gets nothing here;
/// `validate_input_for_model` refuses that request before it gets this far.
fn push_input_args(
    args: &mut Vec<String>,
    image_input: ImageInput,
    input: &Path,
    request: &ImageRequest,
) {
    match image_input {
        ImageInput::Init => {
            push_pair(args, "-i", input.to_string_lossy());
            push_pair(args, "--strength", init_strength(request));
        }
        ImageInput::Reference => {
            push_pair(args, "-r", input.to_string_lossy());
            push_pair(args, "--sampling-method", REFERENCE_SAMPLER);
        }
        ImageInput::None => {}
    }
}

/// True when the run needs `--batched-cfg off`: an init image on any device (the blank white image
/// is also seen on the CPU), or a device that is not the CPU.
fn needs_batched_cfg_off(image_input: ImageInput, has_input: bool, backend: Option<&str>) -> bool {
    let init_image = has_input && image_input == ImageInput::Init;
    init_image || backend.is_some_and(|device| !is_cpu_backend(device))
}

/// The negative prompt with its surrounding spaces removed, or None when it has no text.
fn effective_negative_prompt(request: &ImageRequest) -> Option<&str> {
    request
        .negative_prompt
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

/// True when the `--backend` name is a CPU device (`CPU`, `cpu1`, ...). The match ignores case.
fn is_cpu_backend(device: &str) -> bool {
    device_kind(device) == DeviceKind::Cpu
}

fn push_pair(args: &mut Vec<String>, flag: &str, value: impl std::fmt::Display) {
    args.push(flag.to_string());
    args.push(value.to_string());
}

/// One thread per logical core, the most sd-cli can use. One when the count is unknown.
fn thread_count() -> usize {
    std::thread::available_parallelism()
        .map(NonZeroUsize::get)
        .unwrap_or(1)
}

#[cfg(test)]
mod tests {
    use super::super::catalog::find_recipe;
    use super::*;

    fn request_for(model_id: &str) -> ImageRequest {
        let recipe = find_recipe(model_id).expect("recipe");
        ImageRequest {
            job_id: "job-1".to_string(),
            model_id: model_id.to_string(),
            prompt: "a red fox in the snow".to_string(),
            negative_prompt: None,
            width: recipe.defaults.width,
            height: recipe.defaults.height,
            steps: recipe.defaults.steps,
            cfg_scale: recipe.defaults.cfg_scale,
            seed: 42,
            device: None,
            input_path: None,
            strength: None,
        }
    }

    /// Local paths for a recipe, as the generate command builds them.
    fn paths_for(model_id: &str) -> Vec<(ModelRole, PathBuf)> {
        find_recipe(model_id)
            .expect("recipe")
            .local_paths(Path::new("models"))
    }

    fn output() -> PathBuf {
        PathBuf::from("out").join("job-1.png")
    }

    /// The arguments for `model_id` with its default request and no device.
    fn args_for(model_id: &str) -> Vec<String> {
        build_args(
            find_recipe(model_id).expect("recipe"),
            &paths_for(model_id),
            &request_for(model_id),
            &output(),
            None,
            None,
        )
    }

    /// The arguments without the `-t` thread count, which depends on the machine.
    fn without_threads(mut args: Vec<String>) -> Vec<String> {
        if let Some(index) = args.iter().position(|arg| arg == "-t") {
            args.drain(index..index + 2);
        }
        args
    }

    fn strings(parts: &[&str]) -> Vec<String> {
        parts.iter().map(|part| part.to_string()).collect()
    }

    fn value_after<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
        args.iter()
            .position(|arg| arg == flag)
            .and_then(|index| args.get(index + 1))
            .map(String::as_str)
    }

    fn local(model_id: &str, role: ModelRole) -> String {
        paths_for(model_id)
            .into_iter()
            .find(|(path_role, _)| *path_role == role)
            .map(|(_, path)| path.to_string_lossy().into_owned())
            .expect("path for role")
    }

    #[test]
    fn sd15_passes_only_the_checkpoint() {
        let args = args_for("sd15-q4");
        assert_eq!(
            value_after(&args, "-m"),
            Some(local("sd15-q4", ModelRole::Model).as_str())
        );
        assert!(value_after(&args, "--vae").is_none());
        assert!(value_after(&args, "--llm").is_none());
        assert!(value_after(&args, "--diffusion-model").is_none());
        assert_eq!(value_after(&args, "-p"), Some("a red fox in the snow"));
        assert_eq!(value_after(&args, "-W"), Some("512"));
        assert_eq!(value_after(&args, "-H"), Some("512"));
        assert_eq!(value_after(&args, "--steps"), Some("20"));
        assert_eq!(value_after(&args, "--cfg-scale"), Some("7"));
        assert_eq!(value_after(&args, "--seed"), Some("42"));
    }

    #[test]
    fn flux2_passes_diffusion_model_vae_and_llm() {
        let recipe = find_recipe("flux2-klein-4b-q4").expect("flux");
        let args = args_for(recipe.id);
        assert_eq!(
            value_after(&args, "--diffusion-model"),
            Some(local(recipe.id, ModelRole::Model).as_str())
        );
        assert_eq!(
            value_after(&args, "--vae"),
            Some(local(recipe.id, ModelRole::Vae).as_str())
        );
        assert_eq!(
            value_after(&args, "--llm"),
            Some(local(recipe.id, ModelRole::Llm).as_str())
        );
        assert!(value_after(&args, "-m").is_none());
        assert_eq!(value_after(&args, "--steps"), Some("4"));
        assert_eq!(value_after(&args, "--cfg-scale"), Some("1"));
    }

    #[test]
    fn z_image_passes_diffusion_model_vae_and_llm() {
        let recipe = find_recipe("z-image-turbo-q4").expect("z-image");
        let args = args_for(recipe.id);
        assert_eq!(
            value_after(&args, "--diffusion-model"),
            Some(local(recipe.id, ModelRole::Model).as_str())
        );
        assert_eq!(
            value_after(&args, "--vae"),
            Some(local(recipe.id, ModelRole::Vae).as_str())
        );
        assert_eq!(
            value_after(&args, "--llm"),
            Some(local(recipe.id, ModelRole::Llm).as_str())
        );
        assert_eq!(value_after(&args, "--steps"), Some("8"));
    }

    #[test]
    fn every_model_flag_is_present_for_its_role() {
        for recipe in super::super::catalog::RECIPES {
            let args = args_for(recipe.id);
            for (flag, _) in recipe.flags {
                assert!(
                    value_after(&args, flag).is_some(),
                    "{} lacks {flag}",
                    recipe.id
                );
            }
        }
    }

    #[test]
    fn output_and_threads_are_always_set() {
        let args = args_for("sd15-q4");
        assert_eq!(
            value_after(&args, "-o"),
            Some(output().to_string_lossy().as_ref())
        );
        let threads: usize = value_after(&args, "-t")
            .and_then(|value| value.parse().ok())
            .expect("thread count");
        assert_eq!(threads, thread_count());
        assert!(threads >= 1);
    }

    #[test]
    fn negative_prompt_is_passed_only_when_it_has_text() {
        let recipe = find_recipe("sd15-q4").expect("sd15");
        let mut request = request_for("sd15-q4");
        request.negative_prompt = Some("  blurry  ".to_string());
        let args = build_args(
            recipe,
            &paths_for("sd15-q4"),
            &request,
            &output(),
            None,
            None,
        );
        assert_eq!(value_after(&args, "-n"), Some("blurry"));

        for blank in [None, Some(String::new()), Some("   ".to_string())] {
            request.negative_prompt = blank;
            let args = build_args(
                recipe,
                &paths_for("sd15-q4"),
                &request,
                &output(),
                None,
                None,
            );
            assert!(value_after(&args, "-n").is_none());
        }
    }

    #[test]
    fn distilled_models_never_get_a_negative_prompt_or_their_own_cfg() {
        for model_id in ["flux2-klein-4b-q4", "z-image-turbo-q4"] {
            let recipe = find_recipe(model_id).expect("distilled");
            let mut request = request_for(model_id);
            request.negative_prompt = Some("blurry".to_string());
            request.cfg_scale = 5.5;
            let args = build_args(
                recipe,
                &paths_for(model_id),
                &request,
                &output(),
                None,
                None,
            );
            assert!(value_after(&args, "-n").is_none(), "{model_id} got -n");
            assert_eq!(
                value_after(&args, "--cfg-scale"),
                Some(recipe.defaults.cfg_scale.to_string().as_str()),
                "{model_id} did not force its default cfg"
            );
        }
    }

    #[test]
    fn sd15_passes_the_requested_cfg_and_negative_prompt() {
        let recipe = find_recipe("sd15-q4").expect("sd15");
        let mut request = request_for("sd15-q4");
        request.negative_prompt = Some("blurry".to_string());
        request.cfg_scale = 3.5;
        let args = build_args(
            recipe,
            &paths_for("sd15-q4"),
            &request,
            &output(),
            None,
            None,
        );
        assert_eq!(value_after(&args, "-n"), Some("blurry"));
        assert_eq!(value_after(&args, "--cfg-scale"), Some("3.5"));
    }

    #[test]
    fn no_device_means_no_backend_flag() {
        for recipe in super::super::catalog::RECIPES {
            let args = args_for(recipe.id);
            assert!(value_after(&args, "--backend").is_none(), "{}", recipe.id);
        }
    }

    #[test]
    fn a_chosen_device_is_the_only_backend_and_no_module_is_pinned() {
        let recipe = find_recipe("flux2-klein-4b-q4").expect("flux");
        let args = build_args(
            recipe,
            &paths_for(recipe.id),
            &request_for(recipe.id),
            &output(),
            Some("GPUOpenCL0"),
            None,
        );
        assert_eq!(value_after(&args, "--backend"), Some("GPUOpenCL0"));
        assert_eq!(args.iter().filter(|arg| *arg == "--backend").count(), 1);
        // No `te=cpu` or other per-module assignment is added for the text encoder.
        assert!(args.iter().all(|arg| !arg.contains('=')));
        assert_eq!(
            value_after(&args, "--llm"),
            Some(local(recipe.id, ModelRole::Llm).as_str())
        );
    }

    #[test]
    fn a_device_is_passed_for_the_checkpoint_model_too() {
        let recipe = find_recipe("sd15-q4").expect("sd15");
        let args = build_args(
            recipe,
            &paths_for("sd15-q4"),
            &request_for("sd15-q4"),
            &output(),
            Some("HTP0"),
            None,
        );
        assert_eq!(value_after(&args, "--backend"), Some("HTP0"));
        assert_eq!(
            value_after(&args, "-m"),
            Some(local("sd15-q4", ModelRole::Model).as_str())
        );
    }

    fn args_on_device(model_id: &str, device: Option<&str>) -> Vec<String> {
        build_args(
            find_recipe(model_id).expect("recipe"),
            &paths_for(model_id),
            &request_for(model_id),
            &output(),
            device,
            None,
        )
    }

    #[test]
    fn cpu_device_gets_no_batched_cfg_flag() {
        for device in ["CPU", "cpu", "cpu1"] {
            let args = args_on_device("sd15-q4", Some(device));
            assert_eq!(value_after(&args, "--backend"), Some(device));
            assert!(
                value_after(&args, "--batched-cfg").is_none(),
                "{device} should keep the default batched CFG"
            );
        }
    }

    #[test]
    fn gpu_device_turns_batched_cfg_off() {
        let args = args_on_device("sd15-q4", Some("GPUOpenCL"));
        assert_eq!(value_after(&args, "--backend"), Some("GPUOpenCL"));
        assert_eq!(value_after(&args, "--batched-cfg"), Some("off"));
        assert_eq!(args.iter().filter(|arg| *arg == "--batched-cfg").count(), 1);
    }

    #[test]
    fn npu_device_turns_batched_cfg_off() {
        let args = args_on_device("sd15-q4", Some("HTP0"));
        assert_eq!(value_after(&args, "--batched-cfg"), Some("off"));
    }

    #[test]
    fn no_device_gets_no_batched_cfg_flag() {
        let args = args_on_device("sd15-q4", None);
        assert!(value_after(&args, "--batched-cfg").is_none());
    }

    #[test]
    fn device_names_must_be_short_and_plain() {
        for good in [
            None,
            Some("CPU"),
            Some("GPUOpenCL0"),
            Some("htp_0.1-a"),
            Some("auto"),
        ] {
            assert!(validate_device_name(good).is_ok(), "{good:?}");
        }
        let forty = "a".repeat(40);
        let forty_one = "a".repeat(41);
        assert!(validate_device_name(Some(&forty)).is_ok());
        for bad in [
            "",
            " CPU",
            "CPU ",
            "a b",
            "cpu;rm",
            "a=cpu",
            "te=cpu,diffusion=vulkan0",
            "x&y",
            "a/b",
            "a\\b",
            "ünïcode",
            forty_one.as_str(),
        ] {
            assert!(validate_device_name(Some(bad)).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn a_resolved_seed_is_never_negative() {
        let kept = request_for("sd15-q4").with_resolved_seed();
        assert_eq!(kept.seed, 42);
        let mut random = request_for("sd15-q4");
        random.seed = -1;
        assert!(random.with_resolved_seed().seed >= 0);
    }

    #[test]
    fn valid_request_passes_and_bad_fields_are_named() {
        assert!(validate_request(&request_for("sd15-q4")).is_ok());

        /// A label and the change that makes a valid request invalid.
        type InvalidCase = (&'static str, fn(&mut ImageRequest));
        let cases: Vec<InvalidCase> = vec![
            ("empty prompt", |r: &mut ImageRequest| {
                r.prompt = "   ".to_string()
            }),
            ("width not multiple of 8", |r: &mut ImageRequest| {
                r.width = 500
            }),
            ("width too small", |r: &mut ImageRequest| r.width = 32),
            ("height too large", |r: &mut ImageRequest| r.height = 4096),
            ("zero steps", |r: &mut ImageRequest| r.steps = 0),
            ("too many steps", |r: &mut ImageRequest| r.steps = 500),
            ("NaN cfg", |r: &mut ImageRequest| r.cfg_scale = f32::NAN),
            ("negative cfg", |r: &mut ImageRequest| r.cfg_scale = -1.0),
            ("seed below -1", |r: &mut ImageRequest| r.seed = -2),
            ("prompt too long", |r: &mut ImageRequest| {
                r.prompt = "x".repeat(2001)
            }),
            ("device with a space", |r: &mut ImageRequest| {
                r.device = Some("GPU 0".to_string())
            }),
        ];
        for (label, mutate) in cases {
            let mut request = request_for("sd15-q4");
            mutate(&mut request);
            assert!(
                validate_request(&request).is_err(),
                "{label} should be rejected"
            );
        }
    }

    #[test]
    fn request_reads_the_camel_case_contract() {
        let json = serde_json::json!({
            "jobId": "job-1",
            "modelId": "sd15-q4",
            "prompt": "a lighthouse",
            "width": 512,
            "height": 512,
            "steps": 20,
            "cfgScale": 7.0,
            "seed": -1
        });
        let request: ImageRequest = serde_json::from_value(json).expect("parses");
        assert_eq!(request.job_id, "job-1");
        assert_eq!(request.negative_prompt, None);
        assert_eq!(request.seed, -1);
        assert_eq!(request.device, None, "a missing device is no device");

        let with_device = serde_json::json!({
            "jobId": "job-2",
            "modelId": "sd15-q4",
            "prompt": "a lighthouse",
            "width": 512,
            "height": 512,
            "steps": 20,
            "cfgScale": 7.0,
            "seed": 3,
            "device": "HTP0"
        });
        let request: ImageRequest = serde_json::from_value(with_device).expect("parses");
        assert_eq!(request.device.as_deref(), Some("HTP0"));
    }

    #[test]
    fn input_fields_read_the_camel_case_contract() {
        let with_input: ImageRequest = serde_json::from_value(serde_json::json!({
            "jobId": "job-3",
            "modelId": "sd15-q4",
            "prompt": "a lighthouse",
            "width": 256,
            "height": 256,
            "steps": 8,
            "cfgScale": 7.0,
            "seed": 1,
            "inputPath": "C:\\pictures\\cow.png",
            "strength": 0.6
        }))
        .expect("parses");
        assert_eq!(
            with_input.input_path.as_deref(),
            Some("C:\\pictures\\cow.png")
        );
        assert_eq!(with_input.strength, Some(0.6));

        let text_only: ImageRequest = serde_json::from_value(serde_json::json!({
            "jobId": "job-4",
            "modelId": "sd15-q4",
            "prompt": "a lighthouse",
            "width": 256,
            "height": 256,
            "steps": 8,
            "cfgScale": 7.0,
            "seed": 1
        }))
        .expect("parses");
        assert_eq!(text_only.input_path, None);
        assert_eq!(text_only.strength, None);
    }

    /// The exact arguments of a text-to-image request, for each model, with no input picture. These
    /// must not change when image-to-image is added.
    #[test]
    fn text_to_image_vectors_are_unchanged() {
        let out = output().to_string_lossy().into_owned();

        let sd15 = local("sd15-q4", ModelRole::Model);
        assert_eq!(
            without_threads(args_for("sd15-q4")),
            strings(&[
                "-m",
                sd15.as_str(),
                "-p",
                "a red fox in the snow",
                "-W",
                "512",
                "-H",
                "512",
                "--steps",
                "20",
                "--cfg-scale",
                "7",
                "--seed",
                "42",
                "-o",
                out.as_str(),
            ])
        );

        for model_id in ["flux2-klein-4b-q4", "z-image-turbo-q4"] {
            let steps = find_recipe(model_id)
                .expect("recipe")
                .defaults
                .steps
                .to_string();
            let diffusion = local(model_id, ModelRole::Model);
            let vae = local(model_id, ModelRole::Vae);
            let llm = local(model_id, ModelRole::Llm);
            assert_eq!(
                without_threads(args_for(model_id)),
                strings(&[
                    "--diffusion-model",
                    diffusion.as_str(),
                    "--vae",
                    vae.as_str(),
                    "--llm",
                    llm.as_str(),
                    "-p",
                    "a red fox in the snow",
                    "-W",
                    "512",
                    "-H",
                    "512",
                    "--steps",
                    steps.as_str(),
                    "--cfg-scale",
                    "1",
                    "--seed",
                    "42",
                    "-o",
                    out.as_str(),
                ]),
                "{model_id}"
            );
        }
    }

    /// An init image request: 256 px, 8 steps, seed 42, on `sd15-q4` with the picture `cow.png`.
    fn init_request() -> ImageRequest {
        let mut request = request_for("sd15-q4");
        request.width = 256;
        request.height = 256;
        request.steps = 8;
        request.input_path = Some("cow.png".to_string());
        request
    }

    #[test]
    fn init_image_vector_passes_the_strength_and_turns_batched_cfg_off() {
        let recipe = find_recipe("sd15-q4").expect("sd15");
        let mut request = init_request();
        request.strength = Some(0.6);
        let input = PathBuf::from("cow.png");
        let args = build_args(
            recipe,
            &paths_for("sd15-q4"),
            &request,
            &output(),
            None,
            Some(&input),
        );

        let model = local("sd15-q4", ModelRole::Model);
        let out = output().to_string_lossy().into_owned();
        assert_eq!(
            without_threads(args),
            strings(&[
                "-m",
                model.as_str(),
                "-i",
                "cow.png",
                "--strength",
                "0.6",
                "-p",
                "a red fox in the snow",
                "-W",
                "256",
                "-H",
                "256",
                "--steps",
                "8",
                "--cfg-scale",
                "7",
                "--seed",
                "42",
                "--batched-cfg",
                "off",
                "-o",
                out.as_str(),
            ])
        );
    }

    #[test]
    fn init_image_on_the_cpu_defaults_the_strength_and_keeps_batched_cfg_off() {
        let recipe = find_recipe("sd15-q4").expect("sd15");
        let request = init_request();
        let input = PathBuf::from("cow.png");
        let args = build_args(
            recipe,
            &paths_for("sd15-q4"),
            &request,
            &output(),
            Some("CPU"),
            Some(&input),
        );

        let model = local("sd15-q4", ModelRole::Model);
        let out = output().to_string_lossy().into_owned();
        assert_eq!(
            without_threads(args),
            strings(&[
                "-m",
                model.as_str(),
                "-i",
                "cow.png",
                "--strength",
                "0.6",
                "-p",
                "a red fox in the snow",
                "-W",
                "256",
                "-H",
                "256",
                "--steps",
                "8",
                "--cfg-scale",
                "7",
                "--seed",
                "42",
                "--backend",
                "CPU",
                "--batched-cfg",
                "off",
                "-o",
                out.as_str(),
            ])
        );
    }

    #[test]
    fn init_image_on_a_gpu_sends_batched_cfg_off_once() {
        let recipe = find_recipe("sd15-q4").expect("sd15");
        let input = PathBuf::from("cow.png");
        let args = build_args(
            recipe,
            &paths_for("sd15-q4"),
            &init_request(),
            &output(),
            Some("GPUOpenCL0"),
            Some(&input),
        );
        assert_eq!(args.iter().filter(|arg| *arg == "--batched-cfg").count(), 1);
        assert_eq!(value_after(&args, "--batched-cfg"), Some("off"));
    }

    #[test]
    fn reference_vector_passes_the_picture_with_no_strength() {
        let recipe = find_recipe("flux2-klein-4b-q4").expect("flux");
        let mut request = request_for(recipe.id);
        request.width = 256;
        request.height = 256;
        request.seed = 7;
        request.input_path = Some("cow.png".to_string());
        request.strength = Some(0.2);
        let input = PathBuf::from("cow.png");
        let args = build_args(
            recipe,
            &paths_for(recipe.id),
            &request,
            &output(),
            None,
            Some(&input),
        );

        let diffusion = local(recipe.id, ModelRole::Model);
        let vae = local(recipe.id, ModelRole::Vae);
        let llm = local(recipe.id, ModelRole::Llm);
        let out = output().to_string_lossy().into_owned();
        assert_eq!(
            without_threads(args),
            strings(&[
                "--diffusion-model",
                diffusion.as_str(),
                "--vae",
                vae.as_str(),
                "--llm",
                llm.as_str(),
                "-r",
                "cow.png",
                "--sampling-method",
                "euler",
                "-p",
                "a red fox in the snow",
                "-W",
                "256",
                "-H",
                "256",
                "--steps",
                "4",
                "--cfg-scale",
                "1",
                "--seed",
                "7",
                "-o",
                out.as_str(),
            ])
        );
    }

    #[test]
    fn an_input_picture_needs_a_model_that_takes_one() {
        let recipe = find_recipe("z-image-turbo-q4").expect("z-image");
        let mut request = request_for(recipe.id);
        request.input_path = Some("cow.png".to_string());
        let error = validate_input_for_model(recipe, &request).expect_err("refused");
        assert!(error.contains("Z-Image Turbo"), "{error}");
    }

    #[test]
    fn a_request_without_an_input_picture_is_never_refused_here() {
        for recipe in super::super::catalog::RECIPES {
            let mut request = request_for(recipe.id);
            request.strength = Some(9.0);
            assert!(
                validate_input_for_model(recipe, &request).is_ok(),
                "{}",
                recipe.id
            );
        }
    }

    #[test]
    fn an_init_strength_must_be_between_five_hundredths_and_one() {
        let recipe = find_recipe("sd15-q4").expect("sd15");
        let mut request = init_request();
        for good in [None, Some(0.05), Some(0.6), Some(1.0)] {
            request.strength = good;
            assert!(
                validate_input_for_model(recipe, &request).is_ok(),
                "{good:?}"
            );
        }
        for bad in [
            Some(0.0),
            Some(0.04),
            Some(1.01),
            Some(-0.5),
            Some(f32::NAN),
        ] {
            request.strength = bad;
            assert!(
                validate_input_for_model(recipe, &request).is_err(),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn a_reference_edit_ignores_the_strength() {
        let recipe = find_recipe("flux2-klein-4b-q4").expect("flux");
        let mut request = request_for(recipe.id);
        request.input_path = Some("cow.png".to_string());
        request.strength = Some(9.0);
        assert!(validate_input_for_model(recipe, &request).is_ok());
    }
}

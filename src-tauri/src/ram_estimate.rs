//! RAM a cached model needs once it is loaded. Pure arithmetic: the command module reads the file
//! sizes and GGUF headers and passes them in, so every rule here is testable without a disk.

/// One mebibyte in bytes.
const MIB: u64 = 1024 * 1024;

/// Compute buffers as a share of the weights, in percent.
const COMPUTE_BUFFER_PERCENT: u64 = 10;
/// Smallest compute-buffer allowance, whatever the size of the weights.
const COMPUTE_BUFFER_MIN_BYTES: u64 = 256 * MIB;
/// Total as a share of the weights, in percent, when the header cannot give the KV cache.
const UNREADABLE_HEADER_PERCENT: u64 = 120;
/// Total as a share of the weights, in percent, for a QAIRT bundle (its context is fixed in the bundle).
const QAIRT_BUNDLE_PERCENT: u64 = 110;
/// Largest context a default estimate assumes, when the model's native length is above it.
const DEFAULT_CONTEXT_CAP: u64 = 8192;
/// Context assumed for a default estimate when the model does not state its native length.
const FALLBACK_CONTEXT: u64 = 4096;

/// Estimated RAM of one model at one precision, split by what it is made of. The total is their sum.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RamEstimate {
    pub weights_bytes: u64,
    /// KV cache for the whole context window. Zero when the model has none to estimate.
    pub kv_bytes: u64,
    /// Compute buffers plus the vision projector.
    pub extra_bytes: u64,
    /// True when a flat factor stood in for a measured KV cache, or the size of the files is unknown.
    pub approximate: bool,
}

impl RamEstimate {
    fn new(weights_bytes: u64, kv_bytes: u64, extra_bytes: u64, approximate: bool) -> Self {
        Self {
            weights_bytes,
            kv_bytes,
            extra_bytes,
            approximate,
        }
    }
}

/// `value` times `percent` / 100, rounded down. Widened so the product cannot overflow.
fn percent_of(value: u64, percent: u64) -> u64 {
    u64::try_from(u128::from(value) * u128::from(percent) / 100).unwrap_or(u64::MAX)
}

/// Compute-buffer allowance for `weights_bytes`: a tenth of the weights, at least 256 MiB.
fn compute_buffer_bytes(weights_bytes: u64) -> u64 {
    percent_of(weights_bytes, COMPUTE_BUFFER_PERCENT).max(COMPUTE_BUFFER_MIN_BYTES)
}

/// Estimate for a GGUF model: the weights, the KV cache from the header, the compute buffers and the
/// projector. `kv_bytes` is `None` when the header does not give the cache size; the estimate then
/// uses a flat factor of the weights instead.
pub fn gguf_estimate(
    weights_bytes: u64,
    projector_bytes: u64,
    kv_bytes: Option<u64>,
) -> RamEstimate {
    match kv_bytes {
        Some(kv_bytes) => RamEstimate::new(
            weights_bytes,
            kv_bytes,
            compute_buffer_bytes(weights_bytes).saturating_add(projector_bytes),
            weights_bytes == 0,
        ),
        None => {
            let flat_extra =
                percent_of(weights_bytes, UNREADABLE_HEADER_PERCENT).saturating_sub(weights_bytes);
            RamEstimate::new(
                weights_bytes,
                0,
                flat_extra.saturating_add(projector_bytes),
                true,
            )
        }
    }
}

/// Estimate for a QAIRT bundle: the bundle's size with a flat allowance, since its context is baked in.
/// A zero size means the files were not found, so the estimate is approximate.
pub fn qairt_estimate(bundle_bytes: u64) -> RamEstimate {
    let extra = percent_of(bundle_bytes, QAIRT_BUNDLE_PERCENT).saturating_sub(bundle_bytes);
    RamEstimate::new(bundle_bytes, 0, extra, bundle_bytes == 0)
}

/// Context length the KV cache is sized for. A requested context is capped at the model's native
/// length, since the model cannot use more. With no request, the native length is capped at
/// `DEFAULT_CONTEXT_CAP`. `FALLBACK_CONTEXT` stands in when the native length is unknown.
pub fn context_for_estimate(requested: Option<u64>, native_context: Option<i64>) -> u64 {
    let native = native_context
        .and_then(|native| u64::try_from(native).ok())
        .filter(|native| *native > 0);
    match (requested, native) {
        (Some(requested), Some(native)) => requested.min(native),
        (Some(requested), None) => requested,
        (None, Some(native)) => native.min(DEFAULT_CONTEXT_CAP),
        (None, None) => FALLBACK_CONTEXT,
    }
}

/// Whether a file name carries `precision` as a whole token, so `Q4_0` matches `model-Q4_0.gguf`,
/// `F16` does not match `BF16`, and `Q4` does not match `Q4_0`. Case does not matter.
pub fn file_name_has_precision(file_name: &str, precision: &str) -> bool {
    let name = file_name.to_ascii_uppercase();
    let wanted = precision.to_ascii_uppercase();
    if wanted.is_empty() {
        return false;
    }
    name.match_indices(&wanted).any(|(at, _)| {
        // A letter or digit before the match, or a letter, digit or `_` after it, means a longer token.
        let before = name[..at].chars().next_back();
        let after = name[at + wanted.len()..].chars().next();
        !before.is_some_and(|c| c.is_ascii_alphanumeric())
            && !after.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_')
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const GIB: u64 = 1024 * MIB;

    /// The total of an estimate: its three parts.
    fn total(got: &RamEstimate) -> u64 {
        got.weights_bytes + got.kv_bytes + got.extra_bytes
    }

    #[test]
    fn compute_buffer_is_a_tenth_above_the_floor() {
        assert_eq!(compute_buffer_bytes(10 * GIB), GIB);
        assert_eq!(compute_buffer_bytes(GIB), COMPUTE_BUFFER_MIN_BYTES);
        assert_eq!(compute_buffer_bytes(0), COMPUTE_BUFFER_MIN_BYTES);
    }

    #[test]
    fn gguf_estimate_adds_kv_cache_compute_buffers_and_projector() {
        let got = gguf_estimate(10 * GIB, 600 * MIB, Some(512 * MIB));
        assert_eq!(got.weights_bytes, 10 * GIB);
        assert_eq!(got.kv_bytes, 512 * MIB);
        assert_eq!(got.extra_bytes, GIB + 600 * MIB);
        assert_eq!(total(&got), 10 * GIB + 512 * MIB + GIB + 600 * MIB);
        assert!(!got.approximate);
    }

    #[test]
    fn gguf_estimate_without_a_kv_size_uses_the_flat_factor() {
        // 1.2 x 10 GiB is 12 GiB; the projector is added on top.
        let got = gguf_estimate(10 * GIB, 0, None);
        assert_eq!(got.kv_bytes, 0);
        assert_eq!(got.extra_bytes, 2 * GIB);
        assert_eq!(total(&got), 12 * GIB);
        assert!(got.approximate);

        let with_projector = gguf_estimate(10 * GIB, MIB, None);
        assert_eq!(total(&with_projector), 12 * GIB + MIB);
    }

    #[test]
    fn qairt_estimate_is_the_bundle_with_a_tenth_extra_and_no_kv() {
        let got = qairt_estimate(10 * GIB);
        assert_eq!(got.kv_bytes, 0);
        assert_eq!(got.extra_bytes, GIB);
        assert_eq!(total(&got), 11 * GIB);
        assert!(!got.approximate);
    }

    #[test]
    fn a_bundle_of_unknown_size_is_approximate_and_zero() {
        let got = qairt_estimate(0);
        assert_eq!(total(&got), 0);
        assert!(got.approximate);
    }

    #[test]
    fn default_context_is_native_capped_at_8192() {
        assert_eq!(context_for_estimate(None, Some(40960)), DEFAULT_CONTEXT_CAP);
        assert_eq!(context_for_estimate(None, Some(2048)), 2048);
        assert_eq!(context_for_estimate(None, None), FALLBACK_CONTEXT);
        assert_eq!(context_for_estimate(None, Some(0)), FALLBACK_CONTEXT);
    }

    #[test]
    fn a_requested_context_is_used_as_given_below_the_native_length() {
        assert_eq!(context_for_estimate(Some(16384), Some(40960)), 16384);
        assert_eq!(context_for_estimate(Some(1000), None), 1000);
    }

    #[test]
    fn a_requested_context_is_capped_at_the_native_length() {
        assert_eq!(context_for_estimate(Some(16384), Some(2048)), 2048);
        assert_eq!(context_for_estimate(Some(4096), Some(0)), 4096);
    }

    #[test]
    fn precision_matches_a_whole_token_only() {
        assert!(file_name_has_precision("Qwen3.5-2B-Q4_0.gguf", "Q4_0"));
        assert!(file_name_has_precision("model_Q8_0.gguf", "Q8_0"));
        assert!(file_name_has_precision("model-f16.gguf", "F16"));
        assert!(!file_name_has_precision("model-BF16.gguf", "F16"));
        assert!(!file_name_has_precision("model-Q4_0.gguf", "Q4"));
        assert!(!file_name_has_precision("model.gguf", ""));
    }
}

//! Reads sd-cli's output and turns it into `playground-image-progress` events. sd-cli redraws its
//! progress bar with carriage returns, so the output is split on `\r` as well as `\n`. Each line is
//! classified as a stage marker, a progress bar redraw, or other output. The tracker keeps the
//! current stage, so a bar is reported under the stage it belongs to. The last few lines are kept
//! for an error report.

use std::collections::VecDeque;

use serde::Serialize;

/// Lines kept for an error report.
const TAIL_LINES: usize = 10;
/// Unfinished output longer than this is cut into a line, so a runaway line cannot grow without
/// bound.
const MAX_PENDING_BYTES: usize = 64 * 1024;
const ESCAPE: char = '\u{1b}';
/// Log lines that open a stage, matched against the message text of the line.
const STAGE_MARKERS: &[(&str, ImagePhase)] = &[
    ("generating image:", ImagePhase::Sampling),
    ("decoding ", ImagePhase::Decoding),
    ("save result image", ImagePhase::Saving),
];

/// The stage of one generation, in the order the stages run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum ImagePhase {
    /// Reading the model files into memory.
    Loading,
    /// Running the text encoder on the prompt.
    Encoding,
    /// The denoising steps. The only stage with a known length.
    Sampling,
    /// Turning the latent image into pixels.
    Decoding,
    /// Writing the PNG.
    Saving,
}

/// `playground-image-progress`. `step` counts finished sampling steps out of `steps`: it is 0 before
/// sampling starts, and `steps` from decoding on. `seconds_per_step` is set on a sampling bar.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ImageProgressEvent {
    pub job_id: String,
    pub phase: ImagePhase,
    pub step: u32,
    pub steps: u32,
    pub seconds_per_step: Option<f64>,
    pub message: String,
}

/// One line of sd-cli output, classified.
#[derive(Debug, Clone, Copy, PartialEq)]
enum SdCliLine {
    /// A line that opens a stage.
    Stage(ImagePhase),
    /// A progress bar redraw.
    Bar(BarReading),
    /// Anything else: information, warnings, or text that is not a bar.
    Other,
}

/// A progress bar redraw, such as `|=====>   | 2/4 -  25.42s/it`.
#[derive(Debug, Clone, Copy, PartialEq)]
struct BarReading {
    pub step: u32,
    pub steps: u32,
    /// Seconds per step, when the bar reports a sampling speed. Model loading and VAE bars report
    /// bytes per second, so they leave this None.
    pub seconds_per_step: Option<f64>,
}

/// Turns a stream of bytes into lines. A line split across two reads is joined.
#[derive(Debug, Default)]
pub(super) struct LineSplitter {
    pending: Vec<u8>,
}

impl LineSplitter {
    /// Add bytes read from the process and return the lines they complete.
    pub(super) fn push(&mut self, bytes: &[u8]) -> Vec<String> {
        self.pending.extend_from_slice(bytes);
        let mut lines = Vec::new();
        while let Some(end) = self.pending.iter().position(|byte| is_break(*byte)) {
            let rest = self.pending.split_off(end + 1);
            let mut line = std::mem::replace(&mut self.pending, rest);
            line.pop();
            lines.extend(text_of(&line));
        }
        if self.pending.len() > MAX_PENDING_BYTES {
            lines.extend(text_of(&std::mem::take(&mut self.pending)));
        }
        lines
    }

    /// The unfinished line left at the end of the stream, if it has text.
    pub(super) fn finish(self) -> Option<String> {
        text_of(&self.pending)
    }
}

fn is_break(byte: u8) -> bool {
    byte == b'\r' || byte == b'\n'
}

/// The trimmed text of a line, or None when it is blank.
fn text_of(bytes: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(bytes);
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// Follows one job's stage and turns each line of output into the event it causes.
#[derive(Debug)]
pub(super) struct ProgressTracker {
    job_id: String,
    steps: u32,
    phase: ImagePhase,
    step: u32,
}

impl ProgressTracker {
    /// A tracker for a job that asks for `steps` sampling steps. It starts in the loading stage.
    pub(super) fn new(job_id: &str, steps: u32) -> Self {
        Self {
            job_id: job_id.to_string(),
            steps,
            phase: ImagePhase::Loading,
            step: 0,
        }
    }

    /// The event that opens the job, sent before sd-cli has printed anything.
    pub(super) fn starting(&self) -> ImageProgressEvent {
        self.event(None, "Starting stable-diffusion.cpp".to_string())
    }

    /// The event for one line of output, or None when the line changes nothing. A stage change
    /// gives one event, and each progress bar redraw gives one event.
    pub(super) fn observe(&mut self, line: &str) -> Option<ImageProgressEvent> {
        let message = message_of(line);
        match classify_line(line) {
            SdCliLine::Stage(phase) => self.enter(phase).then(|| self.event(None, message)),
            SdCliLine::Bar(bar) => Some(self.observe_bar(bar, message)),
            SdCliLine::Other => None,
        }
    }

    /// A sampling bar moves the job to sampling and sets its step. Any other bar is reported under
    /// the current stage, with its counter left out, since it does not count sampling steps.
    fn observe_bar(&mut self, bar: BarReading, message: String) -> ImageProgressEvent {
        if bar.seconds_per_step.is_some() {
            self.enter(ImagePhase::Sampling);
            self.step = bar.step;
            self.steps = bar.steps;
        }
        self.event(bar.seconds_per_step, message)
    }

    /// Move to `phase`. Returns true when the stage changed.
    fn enter(&mut self, phase: ImagePhase) -> bool {
        if self.phase == phase {
            return false;
        }
        self.phase = phase;
        self.step = match phase {
            ImagePhase::Decoding | ImagePhase::Saving => self.steps,
            _ => 0,
        };
        true
    }

    fn event(&self, seconds_per_step: Option<f64>, message: String) -> ImageProgressEvent {
        ImageProgressEvent {
            job_id: self.job_id.clone(),
            phase: self.phase,
            step: self.step,
            steps: self.steps,
            seconds_per_step,
            message,
        }
    }
}

/// Classify one line of sd-cli output. A progress bar is checked before a stage marker.
fn classify_line(line: &str) -> SdCliLine {
    if let Some(bar) = parse_bar(line) {
        return SdCliLine::Bar(bar);
    }
    stage_of(&message_of(line)).map_or(SdCliLine::Other, SdCliLine::Stage)
}

/// The stage a log message opens, if it starts with one of the markers.
fn stage_of(message: &str) -> Option<ImagePhase> {
    if let Some(rest) = message.strip_prefix("generate_image ") {
        // `generate_image 128x128` opens the request. `generate_image completed in ...` does not.
        return rest
            .starts_with(|c: char| c.is_ascii_digit())
            .then_some(ImagePhase::Encoding);
    }
    STAGE_MARKERS
        .iter()
        .find(|(marker, _)| message.starts_with(marker))
        .map(|(_, phase)| *phase)
}

/// The readable text of a line: no terminal escape codes, no `[I]` level and no ` --- file:line`
/// source suffix.
fn message_of(line: &str) -> String {
    let plain = plain_text(line);
    let text = plain.trim();
    let without_level = match text
        .strip_prefix('[')
        .and_then(|rest| rest.split_once("] "))
    {
        Some((_, body)) => body,
        None => text,
    };
    without_level
        .split(" --- ")
        .next()
        .unwrap_or(without_level)
        .trim()
        .to_string()
}

/// The line without terminal escape codes. sd-cli ends each bar with `ESC [ K`, which clears the
/// rest of the terminal line.
pub(super) fn plain_text(line: &str) -> String {
    let mut plain = String::with_capacity(line.len());
    let mut chars = line.chars();
    while let Some(c) = chars.next() {
        if c != ESCAPE {
            plain.push(c);
            continue;
        }
        // A control sequence runs to its final letter, as in `ESC [ K`.
        chars.find(char::is_ascii_alphabetic);
    }
    plain
}

/// The bar on a progress line: the counter after its last `|`, with its speed when it has one.
fn parse_bar(line: &str) -> Option<BarReading> {
    line.match_indices('|')
        .filter_map(|(index, _)| bar_after_fill(&line[index + 1..]))
        .next_back()
}

fn bar_after_fill(text: &str) -> Option<BarReading> {
    let (step, rest) = leading_number(text.trim_start())?;
    let (steps, rest) = leading_number(rest.strip_prefix('/')?)?;
    let ends_cleanly = rest.is_empty()
        || rest.starts_with(|c: char| c.is_whitespace() || matches!(c, '-' | '[' | ESCAPE));
    if !ends_cleanly || steps == 0 || step > steps {
        return None;
    }
    Some(BarReading {
        step,
        steps,
        seconds_per_step: seconds_per_step(rest),
    })
}

/// The speed after a bar counter, as seconds per step. ` -  25.42s/it` gives 25.42, and
/// ` - 2.00it/s` gives 0.5. Any other unit, such as the `GB/s` of a loading bar, gives None.
fn seconds_per_step(rest: &str) -> Option<f64> {
    let speed = rest.trim_start().strip_prefix('-')?.trim_start();
    let (value, unit) = number_and_unit(speed)?;
    match unit {
        "s/it" => Some(value),
        "it/s" => (value > 0.0).then(|| 1.0 / value),
        _ => None,
    }
}

/// A decimal number at the start of `text`, and the unit that follows it up to a space or an escape.
fn number_and_unit(text: &str) -> Option<(f64, &str)> {
    let number_end = text
        .find(|c: char| !(c.is_ascii_digit() || c == '.'))
        .unwrap_or(text.len());
    let value: f64 = text[..number_end].parse().ok()?;
    let after_number = &text[number_end..];
    let unit_end = after_number
        .find(|c: char| c.is_whitespace() || c == ESCAPE)
        .unwrap_or(after_number.len());
    value
        .is_finite()
        .then(|| (value, &after_number[..unit_end]))
}

/// The number at the start of `text` and the text after it. None when there are no digits, or
/// the number does not fit a u32.
fn leading_number(text: &str) -> Option<(u32, &str)> {
    let end = text
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(text.len());
    let number = text[..end].parse().ok()?;
    Some((number, &text[end..]))
}

/// The last `TAIL_LINES` output lines, oldest first.
#[derive(Debug, Default)]
pub(super) struct OutputTail {
    lines: VecDeque<String>,
}

impl OutputTail {
    pub(super) fn push(&mut self, line: String) {
        if self.lines.len() == TAIL_LINES {
            self.lines.pop_front();
        }
        self.lines.push_back(line);
    }

    pub(super) fn to_vec(&self) -> Vec<String> {
        self.lines.iter().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real stable-diffusion.cpp run: sd-turbo, 128 px, one step, CPU. Only the paths are shortened.
    const CAPTURED_LOG: &str = include_str!("testdata/sd-cli-sd-turbo.log");

    fn bar(step: u32, steps: u32, seconds_per_step: Option<f64>) -> SdCliLine {
        SdCliLine::Bar(BarReading {
            step,
            steps,
            seconds_per_step,
        })
    }

    /// The events the captured output produces for a one-step job, starting event first.
    fn events_for_captured_log() -> Vec<ImageProgressEvent> {
        let mut tracker = ProgressTracker::new("job-1", 1);
        let mut events = vec![tracker.starting()];
        let mut splitter = LineSplitter::default();
        let mut lines = splitter.push(CAPTURED_LOG.as_bytes());
        lines.extend(splitter.finish());
        events.extend(lines.iter().filter_map(|line| tracker.observe(line)));
        events
    }

    #[test]
    fn captured_log_moves_through_the_stages_in_order() {
        let mut phases: Vec<ImagePhase> = events_for_captured_log()
            .iter()
            .map(|event| event.phase)
            .collect();
        phases.dedup();
        assert_eq!(
            phases,
            vec![
                ImagePhase::Loading,
                ImagePhase::Encoding,
                ImagePhase::Sampling,
                ImagePhase::Decoding,
                ImagePhase::Saving,
            ]
        );
    }

    #[test]
    fn captured_log_emits_one_event_per_stage_change_and_bar_redraw() {
        // Starting event, six bar redraws (three model loading, one text encoder loading, one
        // sampling, one decoding) and four stage changes (encoding, sampling, decoding, saving).
        assert_eq!(events_for_captured_log().len(), 11);
    }

    #[test]
    fn captured_sampling_step_carries_its_speed() {
        let events = events_for_captured_log();
        let sampled = events
            .iter()
            .find(|event| event.phase == ImagePhase::Sampling && event.seconds_per_step.is_some())
            .expect("a sampling bar");
        assert_eq!(sampled.step, 1);
        assert_eq!(sampled.steps, 1);
        assert_eq!(sampled.seconds_per_step, Some(2.45));
        assert!(sampled.message.contains("1/1"), "{}", sampled.message);
    }

    #[test]
    fn captured_sampling_start_has_no_speed_yet() {
        let events = events_for_captured_log();
        let start = events
            .iter()
            .find(|event| event.phase == ImagePhase::Sampling)
            .expect("sampling starts");
        assert_eq!(start.step, 0);
        assert_eq!(start.steps, 1);
        assert_eq!(start.seconds_per_step, None);
        assert_eq!(start.message, "generating image: 1/1 - seed 42");
    }

    #[test]
    fn loading_bars_are_not_read_as_sampling_steps() {
        let events = events_for_captured_log();
        let loading: Vec<&ImageProgressEvent> = events
            .iter()
            .filter(|event| event.phase == ImagePhase::Loading)
            .collect();
        assert_eq!(loading.len(), 4, "starting event plus three bar redraws");
        for event in loading {
            assert_eq!(event.step, 0);
            assert_eq!(event.seconds_per_step, None);
        }
    }

    #[test]
    fn decoding_and_saving_report_the_steps_as_finished() {
        let events = events_for_captured_log();
        for phase in [ImagePhase::Decoding, ImagePhase::Saving] {
            let event = events
                .iter()
                .find(|event| event.phase == phase)
                .expect("stage event");
            assert_eq!(event.step, 1, "{phase:?}");
            assert_eq!(event.steps, 1, "{phase:?}");
            assert_eq!(event.seconds_per_step, None, "{phase:?}");
        }
        let saved = events
            .iter()
            .rfind(|event| event.phase == ImagePhase::Saving)
            .expect("saving");
        assert!(
            saved.message.starts_with("save result image"),
            "{}",
            saved.message
        );
    }

    #[test]
    fn sampling_bar_reads_step_steps_and_speed() {
        assert_eq!(
            classify_line(
                "  |==================================================| 1/1 -   2.45s/it\u{1b}[K"
            ),
            SdCliLine::Bar(BarReading {
                step: 1,
                steps: 1,
                seconds_per_step: Some(2.45),
            })
        );
        assert_eq!(
            classify_line("|==========>      | 2/4 -  25.42s/it"),
            bar(2, 4, Some(25.42))
        );
    }

    #[test]
    fn a_bar_running_in_it_per_second_is_inverted() {
        assert_eq!(
            classify_line("|====>  | 3/4 - 2.00it/s"),
            bar(3, 4, Some(0.5))
        );
    }

    #[test]
    fn a_byte_rate_bar_is_a_bar_without_a_speed() {
        assert_eq!(
            classify_line("  |##################################################| 686/686 -   2.23GB/s\u{1b}[K"),
            bar(686, 686, None)
        );
        assert_eq!(
            classify_line("  |==================================================| 140/140 - 465.20MB/s\u{1b}[K"),
            bar(140, 140, None)
        );
    }

    #[test]
    fn a_final_counter_with_nothing_after_it_is_a_bar() {
        assert_eq!(classify_line("|===============| 4/4"), bar(4, 4, None));
    }

    #[test]
    fn stage_markers_open_their_stage_and_nothing_else_does() {
        let cases = [
            (
                "[I] generate_image 128x128 --- image.cpp:869",
                SdCliLine::Stage(ImagePhase::Encoding),
            ),
            (
                "[I] generating image: 1/1 - seed 42 --- image.cpp:920",
                SdCliLine::Stage(ImagePhase::Sampling),
            ),
            (
                "[I] decoding 1 latents --- image.cpp:605",
                SdCliLine::Stage(ImagePhase::Decoding),
            ),
            (
                "[I] save result image 0 to 'out.png' (success) --- main.cpp:495",
                SdCliLine::Stage(ImagePhase::Saving),
            ),
            (
                "[I] generate_image completed in 16.77s --- image.cpp:1140",
                SdCliLine::Other,
            ),
            (
                "[I] generating 1 latent images completed, taking 2.45s --- image.cpp:967",
                SdCliLine::Other,
            ),
            (
                "[I] decode_first_stage completed, taking 12.45s --- image.cpp:675",
                SdCliLine::Other,
            ),
            (
                "[I] latent 1 decoded, taking 12.45s --- image.cpp:671",
                SdCliLine::Other,
            ),
            ("[I] 1/1 images saved --- main.cpp:571", SdCliLine::Other),
        ];
        for (line, expected) in cases {
            assert_eq!(classify_line(line), expected, "{line}");
        }
    }

    #[test]
    fn other_lines_are_not_progress() {
        for line in [
            "loading 3/4 tensors",
            "[I] model loaded in 2/3 s",
            "/path/to/1/2/model.gguf",
            "| 5/4",
            "| 0/0",
            "| 2/4x",
            "| 2/",
            "| /4",
            "|=====>",
            "no bar here 1/4",
            "",
        ] {
            assert_eq!(classify_line(line), SdCliLine::Other, "{line:?}");
        }
    }

    #[test]
    fn counters_too_large_for_u32_are_ignored() {
        assert_eq!(classify_line("| 99999999999999999999/4"), SdCliLine::Other);
    }

    #[test]
    fn carriage_returns_split_redrawn_bars_and_the_last_one_wins() {
        let output = "  |=>     | 1/4 - 30.1s/it\r  |==>    | 2/4 - 28.9s/it\r  |=====> | 3/4 - 27.0s/it\r\n |===============| 4/4\n";
        let mut splitter = LineSplitter::default();
        let mut lines = splitter.push(output.as_bytes());
        lines.extend(splitter.finish());
        let steps: Vec<(u32, u32)> = lines
            .iter()
            .filter_map(|line| match classify_line(line) {
                SdCliLine::Bar(bar) => Some((bar.step, bar.steps)),
                _ => None,
            })
            .collect();
        assert_eq!(steps, vec![(1, 4), (2, 4), (3, 4), (4, 4)]);
    }

    #[test]
    fn a_bar_split_across_reads_is_joined() {
        let mut splitter = LineSplitter::default();
        assert!(splitter.push(b"| 1/").is_empty());
        let lines = splitter.push(b"4 - 2s/it\r");
        assert_eq!(lines, vec!["| 1/4 - 2s/it".to_string()]);
        assert_eq!(classify_line(&lines[0]), bar(1, 4, Some(2.0)));
    }

    #[test]
    fn blank_segments_are_skipped() {
        let mut splitter = LineSplitter::default();
        let lines = splitter.push(b"\r\n\r\n  \r| 1/2\r\n");
        assert_eq!(lines, vec!["| 1/2".to_string()]);
    }

    #[test]
    fn the_unfinished_last_line_is_returned_at_the_end() {
        let mut splitter = LineSplitter::default();
        assert!(splitter.push(b"| 2/4 - 9s/it").is_empty());
        assert_eq!(splitter.finish(), Some("| 2/4 - 9s/it".to_string()));
        assert_eq!(LineSplitter::default().finish(), None);
    }

    #[test]
    fn a_runaway_line_is_cut_so_it_cannot_grow_forever() {
        let mut splitter = LineSplitter::default();
        let lines = splitter.push(&vec![b'x'; MAX_PENDING_BYTES + 1]);
        assert_eq!(lines.len(), 1);
        assert_eq!(splitter.finish(), None);
    }

    #[test]
    fn escape_codes_and_log_decoration_are_removed_from_messages() {
        assert_eq!(
            plain_text("| 1/1 -   2.45s/it\u{1b}[K"),
            "| 1/1 -   2.45s/it"
        );
        assert_eq!(
            message_of("[I] generating image: 1/1 - seed 42 --- image.cpp:920"),
            "generating image: 1/1 - seed 42"
        );
    }

    #[test]
    fn progress_event_json_uses_the_frontend_names_and_null_speed() {
        let mut tracker = ProgressTracker::new("job-1", 4);
        let json = serde_json::to_value(tracker.starting()).expect("json");
        assert_eq!(json["jobId"], "job-1");
        assert_eq!(json["phase"], "loading");
        assert_eq!(json["step"], 0);
        assert_eq!(json["steps"], 4);
        assert!(json["secondsPerStep"].is_null());
        assert_eq!(json["message"], "Starting stable-diffusion.cpp");

        tracker.observe("[I] generating image: 4/4 - seed 1 --- image.cpp:920");
        let line = tracker
            .observe("|==>   | 2/4 -  25.42s/it\u{1b}[K")
            .expect("bar");
        let json = serde_json::to_value(&line).expect("json");
        assert_eq!(json["phase"], "sampling");
        assert_eq!(json["step"], 2);
        assert_eq!(json["secondsPerStep"], 25.42);
    }

    #[test]
    fn output_tail_keeps_the_last_ten_lines_in_order() {
        let mut tail = OutputTail::default();
        for index in 0..15 {
            tail.push(format!("line {index}"));
        }
        let lines = tail.to_vec();
        assert_eq!(lines.len(), TAIL_LINES);
        assert_eq!(lines.first().map(String::as_str), Some("line 5"));
        assert_eq!(lines.last().map(String::as_str), Some("line 14"));
    }
}

//! Conversation compaction: asks the GenieX server to summarise a chat's older messages, so the
//! summary can stand in for them in the next prompt. Each pass is one non-streamed chat completion on
//! the same model and load parameters as chat, so the model is not reloaded. Input that does not fit
//! the window is folded in batches, one pass each. A running job is cancelled by its id.

use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex, MutexGuard};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use super::benchmark_runner::{ensure_no_active_run, BenchmarkRunState};
use super::chat::unless_cancelled;
use super::chat_helpers::{apply_load_params, strip_precision, strip_think, ModelLoadParams};
use super::constants::HTTP_TIMEOUT_SECS;
use super::AppState;

/// Passes allowed to fold one conversation into one summary.
const MAX_PASSES: usize = 4;
/// Low, so the summary stays close to the transcript.
const SUMMARY_TEMPERATURE: f64 = 0.2;
/// The output budget is this percentage of the window, within the bounds below.
const OUTPUT_SHARE_PERCENT: i64 = 15;
const MIN_OUTPUT_TOKENS: u32 = 128;
const MAX_OUTPUT_TOKENS: u32 = 1024;
/// The output budget when the window is not given.
const UNKNOWN_WINDOW_OUTPUT_TOKENS: u32 = 512;

const CANCELLED: &str = "Cancelled.";
const EMPTY_SUMMARY: &str = "The model returned an empty summary.";
const NOTHING_TO_SUMMARISE: &str = "There are no messages to summarise.";
const MESSAGE_TOO_LONG: &str = "A message is too long for the context window.";

/// The system message of every summary request.
const SUMMARY_PROMPT: &str = "You write a brief, factual summary of a conversation so far, for the assistant to use later when it continues the conversation.

Write plain text as bullet points, one per line, each starting with \"- \". Cover, where the conversation has them:
- what the user asked for;
- what was answered or decided;
- results and conclusions;
- names, numbers, file names and identifiers, exactly as written;
- open tasks.

Rules:
- No preamble, no closing remarks and no thinking: output the summary only.
- Do not invent facts. State only what the conversation says.
- Keep the summary under about 300 words.
- If a previous summary is given, merge it with the newer messages into one summary that replaces it.";

/// Who wrote a message. Any other role is refused when the request is read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Speaker {
    User,
    Assistant,
}

impl Speaker {
    /// The name the transcript gives this speaker.
    fn label(self) -> &'static str {
        match self {
            Speaker::User => "User",
            Speaker::Assistant => "Assistant",
        }
    }
}

/// One message to fold into the summary.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SummaryTurn {
    pub role: Speaker,
    pub content: String,
}

/// Request body of `compact_conversation`. `messages` are oldest first and are the ones the summary
/// replaces; `previousSummary` is the summary they follow, if any.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactRequest {
    /// Names the job for `cancel_compaction`.
    pub job_id: String,
    pub base_url: String,
    pub model: String,
    pub load: Option<ModelLoadParams>,
    pub previous_summary: Option<String>,
    pub messages: Vec<SummaryTurn>,
    /// The model's context window in tokens. Without it the input is not split.
    pub window_tokens: Option<i32>,
}

/// Result of `compact_conversation`: the summary text, ready to store as a summary row.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactResult {
    pub summary: String,
}

/// Cancel flag of a running job.
type CancelFlag = Arc<AtomicBool>;

/// Running compaction jobs: id → cancel flag. A job leaves the list when its registration drops.
static RUNNING_JOBS: LazyLock<Mutex<Vec<(String, CancelFlag)>>> =
    LazyLock::new(|| Mutex::new(Vec::new()));

fn lock_jobs() -> Result<MutexGuard<'static, Vec<(String, CancelFlag)>>, String> {
    RUNNING_JOBS
        .lock()
        .map_err(|_| "compaction job registry is unavailable".to_string())
}

/// Removes a job from the registry when the job ends, including on an early error.
struct JobRegistration(CancelFlag);

impl Drop for JobRegistration {
    fn drop(&mut self) {
        if let Ok(mut jobs) = lock_jobs() {
            jobs.retain(|(_, flag)| !Arc::ptr_eq(flag, &self.0));
        }
    }
}

/// Registers a job and returns its cancel flag. Dropping the registration removes the job.
fn register_job(job_id: &str) -> Result<(CancelFlag, JobRegistration), String> {
    let cancel: CancelFlag = Arc::new(AtomicBool::new(false));
    lock_jobs()?.push((job_id.to_owned(), Arc::clone(&cancel)));
    let registration = JobRegistration(Arc::clone(&cancel));
    Ok((cancel, registration))
}

/// Summarise `messages`, after `previousSummary` if given, with the active model. Refused while a
/// benchmark runs. Returns the summary; the caller stores it as a summary row.
#[tauri::command]
pub async fn compact_conversation(
    state: State<'_, AppState>,
    run_state: State<'_, BenchmarkRunState>,
    request: CompactRequest,
) -> Result<CompactResult, String> {
    ensure_no_active_run(&run_state)?;
    let (cancel, _registration) = register_job(&request.job_id)?;

    let window = window_limit(request.window_tokens);
    let output_tokens = output_budget(request.window_tokens);
    let summariser = Summariser {
        client: &state.http_client,
        url: format!("{}/v1/chat/completions", request.base_url),
        model: strip_precision(&request.model).to_owned(),
        load: request.load.unwrap_or_default(),
        output_tokens,
        cancel: &cancel,
    };
    let summary = fold_all(
        clean_previous(request.previous_summary),
        clean_turns(request.messages),
        window,
        output_tokens,
        |previous, batch| summariser.pass(previous, batch),
    )
    .await?;
    Ok(CompactResult { summary })
}

/// Cancel the running compaction `job_id`. Its command then returns "Cancelled.". Other jobs are not
/// affected.
#[tauri::command]
pub async fn cancel_compaction(job_id: String) -> Result<(), String> {
    for (_, cancel) in lock_jobs()?.iter().filter(|(id, _)| *id == job_id) {
        cancel.store(true, Ordering::SeqCst);
    }
    Ok(())
}

/// What one summary request needs besides its messages.
struct Summariser<'a> {
    client: &'a reqwest::Client,
    /// The full chat completions URL.
    url: String,
    model: String,
    load: ModelLoadParams,
    output_tokens: u32,
    cancel: &'a AtomicBool,
}

impl Summariser<'_> {
    /// One pass: the previous summary and `batch` in, the new summary out.
    async fn pass(
        &self,
        previous: Option<String>,
        batch: Vec<SummaryTurn>,
    ) -> Result<String, String> {
        let messages = summary_messages(previous.as_deref(), &batch);
        let body = summary_body(&self.model, messages, &self.load, self.output_tokens);
        let reply = self.post(&body).await?;
        summary_from_reply(&reply)
    }

    /// Sends the request and reads the whole reply. A cancel drops the request.
    async fn post(&self, body: &Value) -> Result<Value, String> {
        let send = self
            .client
            .post(&self.url)
            .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
            .json(body)
            .send();
        let response = unless_cancelled(self.cancel, send)
            .await
            .ok_or(CANCELLED)?
            .map_err(|e| format!("Failed to connect to GenieX server at {}: {e}", self.url))?;
        let status = response.status();
        let text = unless_cancelled(self.cancel, response.text())
            .await
            .ok_or(CANCELLED)?
            .map_err(|e| format!("The server reply could not be read: {e}"))?;
        if !status.is_success() {
            return Err(format!("Server returned {status}: {text}"));
        }
        serde_json::from_str(&text).map_err(|e| format!("The server sent an unreadable reply: {e}"))
    }
}

/// Folds `pending` into `previous`, one pass at a time. Each pass sends the previous summary and the
/// next batch from `batch_len`; its reply is the previous summary of the pass after. Gives up after
/// `MAX_PASSES` passes. `pending` must not be empty.
async fn fold_all<F, Fut>(
    mut previous: Option<String>,
    mut pending: Vec<SummaryTurn>,
    window: u64,
    output_tokens: u32,
    mut pass: F,
) -> Result<String, String>
where
    F: FnMut(Option<String>, Vec<SummaryTurn>) -> Fut,
    Fut: Future<Output = Result<String, String>>,
{
    if pending.is_empty() {
        return Err(NOTHING_TO_SUMMARISE.to_owned());
    }
    for _ in 0..MAX_PASSES {
        let size = batch_len(&pending, previous.as_deref(), window, output_tokens)
            .ok_or(MESSAGE_TOO_LONG)?;
        let batch: Vec<SummaryTurn> = pending.drain(..size).collect();
        let summary = pass(previous.take(), batch).await?;
        if pending.is_empty() {
            return Ok(summary);
        }
        previous = Some(summary);
    }
    Err(format!(
        "The conversation is too long to summarise in {MAX_PASSES} passes."
    ))
}

/// How many of the oldest `pending` messages the next pass folds in. All of them when they fit in the
/// window with the previous summary, the prompt and the output budget. Otherwise the older half
/// (rounded up), halved again until it fits. `None` when not even one message fits.
fn batch_len(
    pending: &[SummaryTurn],
    previous: Option<&str>,
    window: u64,
    output_tokens: u32,
) -> Option<usize> {
    let fits = |count: usize| {
        let input = summary_user_text(previous, &pending[..count]);
        estimate_tokens(SUMMARY_PROMPT) + estimate_tokens(&input) + u64::from(output_tokens)
            <= window
    };
    if fits(pending.len()) {
        return Some(pending.len());
    }
    let mut count = pending.len().div_ceil(2);
    while count > 0 {
        if fits(count) {
            return Some(count);
        }
        count /= 2;
    }
    None
}

/// Tokens of `text`, estimated as one token per four characters, rounded up.
fn estimate_tokens(text: &str) -> u64 {
    u64::try_from(text.chars().count())
        .unwrap_or(u64::MAX)
        .div_ceil(4)
}

/// The window in tokens. Without one, nothing is ever split, so the limit is unbounded.
fn window_limit(window_tokens: Option<i32>) -> u64 {
    window_tokens.map_or(u64::MAX, |window| u64::try_from(window).unwrap_or(0))
}

/// Output budget of a summary: a share of the window, within the bounds.
fn output_budget(window_tokens: Option<i32>) -> u32 {
    match window_tokens {
        None => UNKNOWN_WINDOW_OUTPUT_TOKENS,
        Some(window) => {
            let share = i64::from(window) * OUTPUT_SHARE_PERCENT / 100;
            let bounded = share.clamp(i64::from(MIN_OUTPUT_TOKENS), i64::from(MAX_OUTPUT_TOKENS));
            u32::try_from(bounded).unwrap_or(MIN_OUTPUT_TOKENS)
        }
    }
}

/// The previous summary without thinking, or None when nothing is left of it.
fn clean_previous(previous: Option<String>) -> Option<String> {
    previous
        .map(|text| strip_think(&text).trim().to_owned())
        .filter(|text| !text.is_empty())
}

/// The messages without thinking. A message that was only thinking is dropped.
fn clean_turns(turns: Vec<SummaryTurn>) -> Vec<SummaryTurn> {
    turns
        .into_iter()
        .filter_map(|turn| {
            let content = strip_think(&turn.content).trim().to_owned();
            (!content.is_empty()).then_some(SummaryTurn {
                role: turn.role,
                content,
            })
        })
        .collect()
}

/// The user turn of a summary request: the previous summary, if any, then one block per message.
fn summary_user_text(previous: Option<&str>, turns: &[SummaryTurn]) -> String {
    let mut blocks: Vec<String> = Vec::with_capacity(turns.len() + 1);
    if let Some(summary) = previous {
        blocks.push(format!("Previous summary:\n{summary}"));
    }
    blocks.extend(
        turns
            .iter()
            .map(|turn| format!("{}: {}", turn.role.label(), turn.content)),
    );
    blocks.join("\n\n")
}

/// The messages of a summary request: the prompt, then the user turn.
fn summary_messages(previous: Option<&str>, batch: &[SummaryTurn]) -> Value {
    json!([
        { "role": "system", "content": SUMMARY_PROMPT },
        { "role": "user", "content": summary_user_text(previous, batch) },
    ])
}

/// The chat completion body of a summary request. Thinking is off and the reply is plain text, and
/// the load parameters are the chat ones, so the server keeps the model loaded.
fn summary_body(model: &str, messages: Value, load: &ModelLoadParams, output_tokens: u32) -> Value {
    let mut body = json!({
        "model": model,
        "messages": messages,
        "stream": false,
        "temperature": SUMMARY_TEMPERATURE,
        "max_tokens": output_tokens,
        "enable_think": false,
        "reasoning_format": "none",
    });
    apply_load_params(&mut body, load);
    body
}

/// The summary text of a chat completion reply: thinking removed and trimmed. Empty text is an error.
fn summary_from_reply(reply: &Value) -> Result<String, String> {
    let content = reply["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("The server sent no text.")?;
    let text = strip_think(content);
    let summary = text.trim();
    if summary.is_empty() {
        return Err(EMPTY_SUMMARY.to_owned());
    }
    Ok(summary.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    const OUTPUT: u32 = 512;

    fn turn(role: Speaker, content: &str) -> SummaryTurn {
        SummaryTurn {
            role,
            content: content.to_owned(),
        }
    }

    /// `count` user messages of about `chars` characters. Each starts with its index, `t0`, `t1`, ...
    fn sized_turns(count: usize, chars: usize) -> Vec<SummaryTurn> {
        (0..count)
            .map(|index| turn(Speaker::User, &format!("t{index}{}", "x".repeat(chars))))
            .collect()
    }

    /// A window that fits the prompt, the output budget and the first `count` messages, with
    /// `slack` tokens to spare.
    fn window_for(turns: &[SummaryTurn], count: usize, previous: Option<&str>, slack: u64) -> u64 {
        let input = summary_user_text(previous, &turns[..count]);
        estimate_tokens(SUMMARY_PROMPT) + estimate_tokens(&input) + u64::from(OUTPUT) + slack
    }

    #[test]
    fn tokens_are_estimated_per_four_characters_rounded_up() {
        assert_eq!(estimate_tokens(""), 0);
        assert_eq!(estimate_tokens("abcd"), 1);
        assert_eq!(estimate_tokens("abcde"), 2);
        assert_eq!(estimate_tokens("ééé"), 1, "characters, not bytes");
    }

    #[test]
    fn output_budget_is_fifteen_percent_of_the_window_within_bounds() {
        assert_eq!(output_budget(None), 512);
        assert_eq!(output_budget(Some(4096)), 614);
        assert_eq!(output_budget(Some(1000)), 150);
        assert_eq!(output_budget(Some(100)), 128);
        assert_eq!(output_budget(Some(0)), 128);
        assert_eq!(output_budget(Some(100_000)), 1024);
    }

    #[test]
    fn window_is_unbounded_without_a_size_and_never_negative() {
        assert_eq!(window_limit(None), u64::MAX);
        assert_eq!(window_limit(Some(-5)), 0);
        assert_eq!(window_limit(Some(4096)), 4096);
    }

    #[test]
    fn summary_body_is_plain_and_keeps_the_chat_load_parameters() {
        let load = ModelLoadParams {
            nctx: Some(8192),
            compute: Some("npu".into()),
            ..Default::default()
        };
        let body = summary_body("org/model", json!([]), &load, 614);
        assert_eq!(body["model"], "org/model");
        assert_eq!(body["stream"], false);
        assert_eq!(body["temperature"], 0.2);
        assert_eq!(body["max_tokens"], 614);
        assert_eq!(body["enable_think"], false);
        assert_eq!(body["reasoning_format"], "none");
        assert_eq!(body["nctx"], 8192);
        assert_eq!(body["compute"], "npu");
        assert!(body.get("stream_options").is_none());
    }

    #[test]
    fn summary_messages_hold_the_prompt_then_the_previous_summary_and_transcript() {
        let batch = vec![
            turn(Speaker::User, "What is 221?"),
            turn(Speaker::Assistant, "13 x 17."),
        ];
        let messages = summary_messages(Some("Earlier: asked about primes."), &batch);
        assert_eq!(messages[0]["role"], "system");
        assert_eq!(messages[0]["content"], SUMMARY_PROMPT);
        assert_eq!(messages[1]["role"], "user");
        assert_eq!(
            messages[1]["content"],
            "Previous summary:\nEarlier: asked about primes.\n\nUser: What is 221?\n\nAssistant: 13 x 17."
        );
    }

    #[test]
    fn without_a_previous_summary_the_user_turn_is_only_the_transcript() {
        let batch = vec![turn(Speaker::User, "Hi")];
        assert_eq!(summary_user_text(None, &batch), "User: Hi");
    }

    #[test]
    fn summary_prompt_keeps_its_rules() {
        for rule in [
            "bullet",
            "exactly as written",
            "Do not invent",
            "300 words",
            "merge it with the newer messages",
            "no thinking",
        ] {
            assert!(SUMMARY_PROMPT.contains(rule), "prompt lacks: {rule}");
        }
    }

    #[test]
    fn reply_is_stripped_of_thinking_and_trimmed() {
        let reply = json!({
            "choices": [{ "message": { "content": "<think>Counting.</think>\n- Asked about 221.\n" } }]
        });
        assert_eq!(
            summary_from_reply(&reply),
            Ok("- Asked about 221.".to_owned())
        );
    }

    #[test]
    fn empty_or_missing_reply_text_is_an_error() {
        let thinking_only = json!({
            "choices": [{ "message": { "content": "<think>never ends" } }]
        });
        assert_eq!(
            summary_from_reply(&thinking_only),
            Err(EMPTY_SUMMARY.to_owned())
        );
        assert!(summary_from_reply(&json!({ "choices": [] })).is_err());
    }

    #[test]
    fn thinking_is_removed_from_the_input_and_messages_left_empty_are_dropped() {
        let cleaned = clean_turns(vec![
            turn(Speaker::User, "<think>x</think>Hi "),
            turn(Speaker::Assistant, "<think>only thinking</think>"),
        ]);
        assert_eq!(cleaned, vec![turn(Speaker::User, "Hi")]);
        assert_eq!(clean_previous(Some("<think>a".into())), None);
        assert_eq!(
            clean_previous(Some(" - Point. ".into())),
            Some("- Point.".to_owned())
        );
    }

    #[test]
    fn a_batch_takes_every_message_that_fits() {
        let turns = sized_turns(3, 400);
        let window = window_for(&turns, 3, None, 4);
        assert_eq!(batch_len(&turns, None, window, OUTPUT), Some(3));
    }

    #[test]
    fn an_oversized_batch_takes_the_older_half_rounded_up() {
        let turns = sized_turns(3, 400);
        let window = window_for(&turns, 2, None, 4);
        assert_eq!(batch_len(&turns, None, window, OUTPUT), Some(2));
    }

    #[test]
    fn the_batch_halves_again_until_it_fits() {
        let turns = sized_turns(4, 400);
        let window = window_for(&turns, 1, None, 4);
        assert_eq!(batch_len(&turns, None, window, OUTPUT), Some(1));
    }

    #[test]
    fn no_batch_exists_when_one_message_or_the_previous_summary_is_too_big() {
        let turns = sized_turns(2, 400);
        let no_room = window_for(&turns, 0, None, 4);
        assert_eq!(batch_len(&turns, None, no_room, OUTPUT), None);

        let one_fits = window_for(&turns, 1, None, 4);
        let long_summary = "y".repeat(2000);
        assert_eq!(
            batch_len(&turns, Some(&long_summary), one_fits, OUTPUT),
            None
        );
    }

    #[tokio::test]
    async fn folding_sends_the_older_batch_first_and_feeds_its_summary_forward() {
        let turns = sized_turns(4, 400);
        // Room for the "Previous summary:" header on the second pass, but not for another message.
        let window = window_for(&turns, 2, None, 32);
        let mut calls: Vec<(Option<String>, Vec<String>)> = Vec::new();
        let summary = fold_all(None, turns, window, OUTPUT, |previous, batch| {
            calls.push((
                previous,
                batch.iter().map(|t| t.content[..2].to_owned()).collect(),
            ));
            let pass = calls.len();
            async move { Ok(format!("S{pass}")) }
        })
        .await;

        assert_eq!(summary, Ok("S2".to_owned()));
        assert_eq!(
            calls,
            vec![
                (None, vec!["t0".to_owned(), "t1".to_owned()]),
                (
                    Some("S1".to_owned()),
                    vec!["t2".to_owned(), "t3".to_owned()]
                ),
            ]
        );
    }

    #[tokio::test]
    async fn folding_gives_up_after_the_last_allowed_pass() {
        let turns = sized_turns(8, 400);
        // One message per pass, with room for the previous summary's header.
        let window = window_for(&turns, 1, None, 32);
        let mut passes = 0;
        let result = fold_all(None, turns, window, OUTPUT, |_, _| {
            passes += 1;
            async { Ok("S".to_owned()) }
        })
        .await;

        assert!(result.is_err(), "four passes fold four of eight messages");
        assert_eq!(passes, MAX_PASSES);
    }

    #[tokio::test]
    async fn folding_nothing_is_an_error() {
        let result = fold_all(None, Vec::new(), u64::MAX, OUTPUT, |_, _| async {
            Ok("unused".to_owned())
        })
        .await;
        assert_eq!(result, Err(NOTHING_TO_SUMMARISE.to_owned()));
    }

    #[test]
    fn request_reads_camel_case_and_only_user_or_assistant_roles() {
        let raw = json!({
            "jobId": "j1",
            "baseUrl": "http://127.0.0.1:18181",
            "model": "org/m:Q4",
            "load": { "nctx": 4096 },
            "previousSummary": null,
            "messages": [{ "role": "user", "content": "hi" }],
            "windowTokens": 4096
        });
        let request: CompactRequest = serde_json::from_value(raw).expect("request parses");
        assert_eq!(request.job_id, "j1");
        assert_eq!(request.window_tokens, Some(4096));
        assert_eq!(request.messages[0].role, Speaker::User);

        let system_turn = json!({
            "jobId": "j1",
            "baseUrl": "http://127.0.0.1:18181",
            "model": "org/m",
            "messages": [{ "role": "system", "content": "x" }]
        });
        assert!(serde_json::from_value::<CompactRequest>(system_turn).is_err());
    }

    #[tokio::test]
    async fn cancelling_a_job_sets_only_its_flag_and_ending_it_forgets_it() {
        let (first, first_registration) = register_job("job-a").expect("register");
        let (second, _second_registration) = register_job("job-b").expect("register");

        cancel_compaction("job-a".to_owned())
            .await
            .expect("cancel runs");
        assert!(first.load(Ordering::SeqCst));
        assert!(!second.load(Ordering::SeqCst));

        drop(first_registration);
        let jobs = lock_jobs().expect("registry");
        assert!(jobs.iter().all(|(_, flag)| !Arc::ptr_eq(flag, &first)));
    }
}

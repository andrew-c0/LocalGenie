//! The politeness state of the DuckDuckGo source, kept for the life of the app: answers reused for a
//! day, the requests of the last hour and the pause after DuckDuckGo limits the app. Every rule is a
//! method that takes the time as an argument, so the tests run on a fixed clock. The functions at the
//! bottom read the clock and the shared state.
use super::SearchHit;
use crate::commands::tools::limits::{
    DUCKDUCKGO_CACHE_MAX_ENTRIES, DUCKDUCKGO_CACHE_TTL_SECS, DUCKDUCKGO_PAUSE_SECS,
    DUCKDUCKGO_WINDOW_LIMIT, DUCKDUCKGO_WINDOW_SECS,
};
use crate::commands::tools::web::client::WebError;
use crate::commands::tools::web::html_text::collapse_whitespace;
use std::collections::{BTreeMap, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const CACHE_TTL: Duration = Duration::from_secs(DUCKDUCKGO_CACHE_TTL_SECS);
const WINDOW: Duration = Duration::from_secs(DUCKDUCKGO_WINDOW_SECS);
const PAUSE: Duration = Duration::from_secs(DUCKDUCKGO_PAUSE_SECS);
const STATE_UNAVAILABLE: &str = "The DuckDuckGo search state is not available.";

/// The state of the source, shared by every call in the app.
static GUARD: Mutex<Guard> = Mutex::new(Guard::new());

/// One stored answer and when it was stored.
struct Stored {
    stored_at: Instant,
    hits: Vec<SearchHit>,
}

/// The answers by query, the start of each request in the window and the time of the last pause.
struct Guard {
    answers: BTreeMap<String, Stored>,
    requests: VecDeque<Instant>,
    paused_at: Option<Instant>,
}

impl Guard {
    const fn new() -> Self {
        Self {
            answers: BTreeMap::new(),
            requests: VecDeque::new(),
            paused_at: None,
        }
    }

    /// The stored answer of `key`, while it is younger than the cache lifetime. An older one is dropped.
    fn answer(&mut self, key: &str, now: Instant) -> Option<Vec<SearchHit>> {
        let stored = self.answers.get(key)?;
        if now.saturating_duration_since(stored.stored_at) < CACHE_TTL {
            return Some(stored.hits.clone());
        }
        self.answers.remove(key);
        None
    }

    /// Stores a non-empty answer. When the cache is full, the oldest answer goes first.
    fn store(&mut self, key: String, hits: &[SearchHit], now: Instant) {
        if hits.is_empty() {
            return;
        }
        if !self.answers.contains_key(&key) && self.answers.len() >= DUCKDUCKGO_CACHE_MAX_ENTRIES {
            let oldest = self
                .answers
                .iter()
                .min_by_key(|(_, stored)| stored.stored_at)
                .map(|(oldest_key, _)| oldest_key.clone());
            if let Some(oldest_key) = oldest {
                self.answers.remove(&oldest_key);
            }
        }
        self.answers.insert(
            key,
            Stored {
                stored_at: now,
                hits: hits.to_vec(),
            },
        );
    }

    /// Whether a request may go out now: not during a pause, and under the limit of the window. A
    /// request that may go out is counted; a refused one is not.
    fn admit(&mut self, now: Instant) -> Result<(), String> {
        if let Some(paused_at) = self.paused_at {
            let remaining = PAUSE.saturating_sub(now.saturating_duration_since(paused_at));
            if !remaining.is_zero() {
                return Err(paused_text(remaining));
            }
        }
        while self
            .requests
            .front()
            .is_some_and(|sent| now.saturating_duration_since(*sent) >= WINDOW)
        {
            self.requests.pop_front();
        }
        if self.requests.len() >= DUCKDUCKGO_WINDOW_LIMIT {
            return Err(limit_text());
        }
        self.requests.push_back(now);
        Ok(())
    }

    /// Starts the pause after DuckDuckGo limited or challenged the app.
    fn pause(&mut self, now: Instant) {
        self.paused_at = Some(now);
    }
}

/// The refusal once the requests of the window are used up.
fn limit_text() -> String {
    format!(
        "DuckDuckGo search limit reached for now ({DUCKDUCKGO_WINDOW_LIMIT} per hour). Try again later or use another source."
    )
}

/// The refusal during a pause, with the minutes left rounded up and at least one.
fn paused_text(remaining: Duration) -> String {
    let minutes = remaining.as_secs().div_ceil(60).max(1);
    format!(
        "DuckDuckGo search is paused for {} after it limited automated searches. Try again later or use another source.",
        minutes_text(minutes)
    )
}

/// `1 minute` or `N minutes`.
pub(super) fn minutes_text(minutes: u64) -> String {
    if minutes == 1 {
        "1 minute".into()
    } else {
        format!("{minutes} minutes")
    }
}

/// The key an answer is stored under: the query trimmed, in lower case, with runs of spaces made one.
pub(super) fn cache_key(query: &str) -> String {
    collapse_whitespace(query).to_lowercase()
}

/// Runs `action` on the shared state. A poisoned lock is a readable failure, not a panic.
fn with_guard<T>(action: impl FnOnce(&mut Guard) -> T) -> Result<T, WebError> {
    let mut guard = GUARD
        .lock()
        .map_err(|_| WebError::Failed(STATE_UNAVAILABLE.into()))?;
    Ok(action(&mut guard))
}

/// The stored answer of `key`, when there is one that is not too old.
pub(super) fn cached_answer(key: &str) -> Result<Option<Vec<SearchHit>>, WebError> {
    with_guard(|guard| guard.answer(key, Instant::now()))
}

/// Stores an answer. Empty answers are not stored.
pub(super) fn store_answer(key: String, hits: &[SearchHit]) -> Result<(), WebError> {
    with_guard(|guard| guard.store(key, hits, Instant::now()))
}

/// Counts a request about to go out, or refuses it with the reason.
pub(super) fn admit_request() -> Result<(), WebError> {
    with_guard(|guard| guard.admit(Instant::now()))?.map_err(WebError::Failed)
}

/// Pauses the source after DuckDuckGo limited or challenged the app.
pub(super) fn pause_source() -> Result<(), WebError> {
    with_guard(|guard| guard.pause(Instant::now()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::tools::limits::DUCKDUCKGO_MIN_INTERVAL_MS;

    fn hit(title: &str) -> SearchHit {
        SearchHit {
            title: title.into(),
            url: format!("https://example.test/{title}"),
            snippet: String::new(),
        }
    }

    fn secs(count: u64) -> Duration {
        Duration::from_secs(count)
    }

    /// A count of the limits as the `u64` seconds the clock needs.
    fn as_secs_count(count: usize) -> u64 {
        u64::try_from(count).expect("a small count")
    }

    #[test]
    fn the_politeness_numbers_are_the_agreed_ones() {
        assert_eq!(DUCKDUCKGO_MIN_INTERVAL_MS, 5000);
        assert_eq!(DUCKDUCKGO_WINDOW_LIMIT, 20);
        assert_eq!(DUCKDUCKGO_WINDOW_SECS, 3600);
        assert_eq!(DUCKDUCKGO_PAUSE_SECS, 900);
        assert_eq!(DUCKDUCKGO_CACHE_TTL_SECS, 86_400);
        assert_eq!(DUCKDUCKGO_CACHE_MAX_ENTRIES, 100);
    }

    #[test]
    fn queries_are_normalised_for_the_cache_key() {
        assert_eq!(cache_key("  Rust   LANG  "), "rust lang");
        assert_eq!(cache_key("rust\tlang"), cache_key("Rust lang"));
        assert_ne!(cache_key("rust lang"), cache_key("rust langs"));
    }

    #[test]
    fn a_stored_answer_is_served_until_the_lifetime_ends() {
        let mut guard = Guard::new();
        let stored = Instant::now();
        guard.store("rust".into(), &[hit("a")], stored);
        let just_before = stored + CACHE_TTL - secs(1);
        assert_eq!(guard.answer("rust", just_before), Some(vec![hit("a")]));
        assert_eq!(guard.answer("rust", stored + CACHE_TTL), None);
        assert!(
            !guard.answers.contains_key("rust"),
            "the old answer is dropped"
        );
    }

    #[test]
    fn an_empty_answer_is_never_stored() {
        let mut guard = Guard::new();
        guard.store("nothing".into(), &[], Instant::now());
        assert!(guard.answers.is_empty());
        assert_eq!(guard.answer("nothing", Instant::now()), None);
    }

    #[test]
    fn a_full_cache_drops_the_oldest_answer_first() {
        let mut guard = Guard::new();
        let start = Instant::now();
        for index in 0..=DUCKDUCKGO_CACHE_MAX_ENTRIES {
            guard.store(
                format!("q{index}"),
                &[hit("a")],
                start + secs(as_secs_count(index)),
            );
        }
        assert_eq!(guard.answers.len(), DUCKDUCKGO_CACHE_MAX_ENTRIES);
        let now = start + secs(as_secs_count(DUCKDUCKGO_CACHE_MAX_ENTRIES) + 1);
        assert_eq!(guard.answer("q0", now), None);
        assert!(guard.answer("q1", now).is_some());
        assert!(guard
            .answer(&format!("q{DUCKDUCKGO_CACHE_MAX_ENTRIES}"), now)
            .is_some());
    }

    #[test]
    fn storing_a_stored_query_again_evicts_nothing() {
        let mut guard = Guard::new();
        let start = Instant::now();
        for index in 0..DUCKDUCKGO_CACHE_MAX_ENTRIES {
            guard.store(
                format!("q{index}"),
                &[hit("a")],
                start + secs(as_secs_count(index)),
            );
        }
        guard.store("q0".into(), &[hit("b")], start + secs(500));
        assert_eq!(guard.answers.len(), DUCKDUCKGO_CACHE_MAX_ENTRIES);
        assert!(guard.answer("q1", start + secs(600)).is_some());
        assert_eq!(guard.answer("q0", start + secs(600)), Some(vec![hit("b")]));
    }

    #[test]
    fn the_hourly_window_admits_its_limit_then_refuses_with_the_readable_text() {
        let mut guard = Guard::new();
        let start = Instant::now();
        for index in 0..DUCKDUCKGO_WINDOW_LIMIT {
            guard
                .admit(start + secs(as_secs_count(index)))
                .expect("within the limit");
        }
        let refusal = guard
            .admit(start + secs(as_secs_count(DUCKDUCKGO_WINDOW_LIMIT)))
            .expect_err("over the limit");
        assert_eq!(
            refusal,
            "DuckDuckGo search limit reached for now (20 per hour). Try again later or use another source."
        );
    }

    #[test]
    fn a_refused_request_is_not_counted_and_the_window_slides() {
        let mut guard = Guard::new();
        let start = Instant::now();
        for index in 0..DUCKDUCKGO_WINDOW_LIMIT {
            guard
                .admit(start + secs(as_secs_count(index)))
                .expect("within the limit");
        }
        assert!(guard.admit(start + secs(30)).is_err());
        let hour_later = start + WINDOW;
        guard
            .admit(hour_later)
            .expect("the first request left the window");
        assert!(guard.admit(hour_later).is_err(), "the window is full again");
    }

    #[test]
    fn a_pause_refuses_with_the_minutes_left_and_then_lets_requests_go() {
        let mut guard = Guard::new();
        let start = Instant::now();
        guard.pause(start);
        let refusal = guard.admit(start + secs(60)).expect_err("paused");
        assert_eq!(
            refusal,
            "DuckDuckGo search is paused for 14 minutes after it limited automated searches. Try again later or use another source."
        );
        assert!(guard.requests.is_empty(), "a paused request is not counted");
        guard.admit(start + PAUSE).expect("the pause is over");
    }

    #[test]
    fn minutes_left_round_up_and_one_minute_is_singular() {
        assert_eq!(minutes_text(1), "1 minute");
        assert_eq!(minutes_text(15), "15 minutes");
        assert!(paused_text(secs(1)).starts_with("DuckDuckGo search is paused for 1 minute "));
        assert!(paused_text(Duration::from_millis(899_500)).contains("for 15 minutes "));
        assert!(paused_text(secs(60)).contains("for 1 minute "));
        assert!(paused_text(secs(61)).contains("for 2 minutes "));
    }
}

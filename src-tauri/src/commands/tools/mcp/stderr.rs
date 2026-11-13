//! The last lines a stdio server wrote to stderr, so a failure can show the server's own message. A
//! background task reads the stream until it ends, so a chatty server never blocks on a full pipe.
//! The tail is bounded (the last lines, each cut at a byte limit, and a total byte cap), and the
//! values of the server's environment and headers are blanked out before any text leaves here.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::AsyncReadExt;
use tokio::process::ChildStderr;
use tokio::sync::watch;
use tokio::time::timeout;

/// Most lines kept in the tail.
const TAIL_MAX_LINES: usize = 20;
/// Longest line kept. A longer line is cut into several lines.
const LINE_MAX_BYTES: usize = 512;
/// Most bytes of output shown in an error.
const TAIL_MAX_BYTES: usize = 4 * 1024;
const READ_CHUNK_BYTES: usize = 1024;
/// Shortest secret value that is blanked out. A shorter value (`1`, `true`) would blank ordinary
/// text, so it is left alone.
const SECRET_MIN_CHARS: usize = 6;
const REDACTED: &str = "[redacted]";

/// The stderr output of one server. Clones share the same buffer.
#[derive(Clone)]
pub struct StderrTail(Arc<Shared>);

struct Shared {
    /// Environment and header values to blank out of any text shown.
    secrets: Vec<String>,
    lines: Mutex<TailBuffer>,
    /// Becomes true when the stream has ended, because the server closed it or exited.
    ended: watch::Sender<bool>,
}

impl StderrTail {
    /// An empty tail that blanks out `secrets`. Nothing is read until `read_from`; until then the
    /// tail counts as ended.
    pub fn new(secrets: Vec<String>) -> Self {
        let (ended, _) = watch::channel(true);
        Self(Arc::new(Shared {
            secrets,
            lines: Mutex::default(),
            ended,
        }))
    }

    /// Read the stream in the background until it ends. The caller does not wait for the read.
    pub fn read_from(&self, stream: ChildStderr) {
        self.0.ended.send_replace(false);
        let shared = Arc::clone(&self.0);
        tokio::spawn(async move {
            copy_into(stream, &shared.lines).await;
            shared.ended.send_replace(true);
        });
    }

    /// Wait until the stream has ended, for at most `limit`.
    pub async fn wait_ended(&self, limit: Duration) {
        let mut ended = self.0.ended.subscribe();
        let _ = timeout(limit, ended.wait_for(|done| *done)).await;
    }

    /// `message`, followed by the server's last output when it wrote any. Secrets are blanked out
    /// of both.
    pub fn with_output(&self, message: &str) -> String {
        let message = self.redact(message);
        let output = self.text();
        if output.is_empty() {
            message
        } else {
            format!("{message}\n\nServer output:\n{output}")
        }
    }

    /// The bounded tail of the output, with secrets blanked out. Empty when nothing was written.
    pub fn text(&self) -> String {
        let shown = match self.0.lines.lock() {
            Ok(lines) => lines.render(),
            Err(_) => String::new(),
        };
        let redacted = self.redact(&shown);
        bounded_tail(&redacted, TAIL_MAX_BYTES).to_string()
    }

    fn redact(&self, text: &str) -> String {
        self.0
            .secrets
            .iter()
            .filter(|secret| secret.chars().count() >= SECRET_MIN_CHARS)
            .fold(text.to_string(), |text, secret| {
                text.replace(secret.as_str(), REDACTED)
            })
    }
}

/// Read until the stream ends, keeping the tail in `lines`. The lock is never held across a read.
async fn copy_into(mut stream: ChildStderr, lines: &Mutex<TailBuffer>) {
    let mut chunk = [0u8; READ_CHUNK_BYTES];
    loop {
        match stream.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(count) => {
                if let Ok(mut tail) = lines.lock() {
                    tail.push(&chunk[..count]);
                }
            }
        }
    }
}

/// The last lines written, and the line still being written. Its memory is bounded by the line and
/// count limits.
#[derive(Default)]
struct TailBuffer {
    lines: VecDeque<String>,
    partial: Vec<u8>,
}

impl TailBuffer {
    fn push(&mut self, bytes: &[u8]) {
        for &byte in bytes {
            if byte == b'\n' {
                self.end_line();
                continue;
            }
            self.partial.push(byte);
            if self.partial.len() >= LINE_MAX_BYTES {
                self.end_line();
            }
        }
    }

    fn end_line(&mut self) {
        let raw = std::mem::take(&mut self.partial);
        let line = String::from_utf8_lossy(&raw)
            .trim_end_matches('\r')
            .to_string();
        if line.is_empty() {
            return;
        }
        self.lines.push_back(line);
        if self.lines.len() > TAIL_MAX_LINES {
            self.lines.pop_front();
        }
    }

    /// The kept lines and the line in progress, joined with newlines.
    fn render(&self) -> String {
        let mut parts: Vec<String> = self.lines.iter().cloned().collect();
        if !self.partial.is_empty() {
            parts.push(String::from_utf8_lossy(&self.partial).into_owned());
        }
        parts.join("\n")
    }
}

/// The last `max_bytes` of `text`, moved forward to a character boundary.
fn bounded_tail(text: &str, max_bytes: usize) -> &str {
    if text.len() <= max_bytes {
        return text;
    }
    let mut start = text.len() - max_bytes;
    while !text.is_char_boundary(start) {
        start += 1;
    }
    &text[start..]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A tail that already holds `output`, as if the server had written it.
    fn tail_with(secrets: &[&str], output: &[u8]) -> StderrTail {
        let tail = StderrTail::new(secrets.iter().map(|s| s.to_string()).collect());
        if let Ok(mut lines) = tail.0.lines.lock() {
            lines.push(output);
        }
        tail
    }

    #[test]
    fn only_the_last_twenty_lines_are_kept() {
        let mut buffer = TailBuffer::default();
        for number in 1..=30 {
            buffer.push(format!("line {number}\n").as_bytes());
        }
        let rendered = buffer.render();
        assert_eq!(rendered.lines().count(), TAIL_MAX_LINES);
        assert!(rendered.starts_with("line 11\n"));
        assert!(rendered.ends_with("line 30"));
    }

    #[test]
    fn a_long_line_is_cut_at_the_line_limit() {
        let mut buffer = TailBuffer::default();
        buffer.push(format!("{}\n", "a".repeat(2000)).as_bytes());
        let rendered = buffer.render();
        assert!(rendered.lines().all(|line| line.len() <= LINE_MAX_BYTES));
        assert_eq!(rendered.replace('\n', "").len(), 2000);
    }

    #[test]
    fn a_line_still_being_written_is_shown_and_kept_within_the_limit() {
        let mut buffer = TailBuffer::default();
        buffer.push(b"half a line");
        assert_eq!(buffer.render(), "half a line");
        buffer.push(&vec![b'x'; LINE_MAX_BYTES * 3]);
        assert!(buffer.partial.len() < LINE_MAX_BYTES);
    }

    #[test]
    fn carriage_returns_and_blank_lines_are_dropped() {
        let mut buffer = TailBuffer::default();
        buffer.push(b"first\r\n\n\nsecond\n");
        assert_eq!(buffer.render(), "first\nsecond");
    }

    #[test]
    fn the_text_is_capped_at_the_byte_limit() {
        let long = "x".repeat(10_000);
        assert_eq!(bounded_tail(&long, TAIL_MAX_BYTES).len(), TAIL_MAX_BYTES);
    }

    #[test]
    fn the_cap_never_splits_a_character() {
        let text = "é".repeat(10);
        let capped = bounded_tail(&text, 5);
        assert!(capped.len() <= 5);
        assert!(capped.ends_with('é'));
    }

    #[test]
    fn secret_values_are_blanked_and_short_values_are_kept() {
        let tail = tail_with(&["hunter22", "1"], b"login hunter22 with 1 token\n");
        assert_eq!(tail.text(), "login [redacted] with 1 token");
    }

    #[test]
    fn a_secret_in_the_message_is_blanked_too() {
        let tail = tail_with(&["hunter22"], b"");
        assert_eq!(
            tail.with_output("The token hunter22 was refused."),
            "The token [redacted] was refused."
        );
    }

    #[test]
    fn the_output_is_appended_under_the_message() {
        let tail = tail_with(&[], b"boom: missing key\n");
        assert_eq!(
            tail.with_output("The server did not start."),
            "The server did not start.\n\nServer output:\nboom: missing key"
        );
    }

    #[test]
    fn a_message_without_output_is_unchanged() {
        let tail = tail_with(&[], b"");
        assert_eq!(tail.with_output("Cannot find 'npx'."), "Cannot find 'npx'.");
    }

    /// A child process that writes to its stderr: `command` runs under the platform shell.
    fn child_writing(command: &str) -> tokio::process::Child {
        let mut shell = if cfg!(windows) {
            let mut shell = tokio::process::Command::new("cmd");
            shell.args(["/C", command]);
            shell
        } else {
            let mut shell = tokio::process::Command::new("sh");
            shell.args(["-c", command]);
            shell
        };
        shell
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .expect("spawn the test shell")
    }

    #[tokio::test]
    async fn the_output_of_a_child_is_read_until_it_ends() {
        let mut child = child_writing("echo boom 1>&2");
        let tail = StderrTail::new(Vec::new());
        tail.read_from(child.stderr.take().expect("piped stderr"));
        tail.wait_ended(Duration::from_secs(10)).await;
        assert!(tail.text().contains("boom"), "{:?}", tail.text());
    }

    #[tokio::test]
    async fn a_chatty_child_is_drained_and_only_its_tail_is_kept() {
        let script = if cfg!(windows) {
            "for /L %i in (1,1,5000) do @echo line %i 1>&2"
        } else {
            "i=1; while [ $i -le 5000 ]; do echo line $i >&2; i=$((i+1)); done"
        };
        let mut child = child_writing(script);
        let tail = StderrTail::new(Vec::new());
        tail.read_from(child.stderr.take().expect("piped stderr"));
        tail.wait_ended(Duration::from_secs(30)).await;
        let _ = child.wait().await;

        let text = tail.text();
        assert!(text.contains("line 5000"), "{text}");
        assert!(!text.contains("line 4000"), "older lines are dropped");
        assert!(text.len() <= TAIL_MAX_BYTES);
    }

    #[tokio::test]
    async fn an_empty_tail_has_ended_already() {
        let tail = StderrTail::new(Vec::new());
        tail.wait_ended(Duration::from_millis(1)).await;
        assert_eq!(tail.text(), "");
    }
}

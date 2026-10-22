use std::collections::VecDeque;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use super::AppState;

/// Most recent GenieX server output kept in memory for the Logs page.
const MAX_LOG_LINES: usize = 2000;

/// One line of `geniex serve` output.
#[derive(Debug, Clone, Serialize)]
pub struct LogLine {
    /// Increases by one per line, so the frontend can drop duplicates.
    pub seq: u64,
    /// `stdout` or `stderr`.
    pub stream: &'static str,
    pub message: String,
}

/// Bounded buffer of server output.
#[derive(Debug, Default)]
pub struct LogBuffer {
    lines: VecDeque<LogLine>,
    next_seq: u64,
}

impl LogBuffer {
    fn push(&mut self, stream: &'static str, message: String) -> LogLine {
        let line = LogLine {
            seq: self.next_seq,
            stream,
            message,
        };
        self.next_seq += 1;
        self.lines.push_back(line.clone());
        while self.lines.len() > MAX_LOG_LINES {
            self.lines.pop_front();
        }
        line
    }
}

/// Store one output line and tell the frontend about it.
/// The buffer is pushed before the event is emitted, so a page that reads the
/// backlog and then listens never misses a line.
pub fn record(app: &AppHandle, stream: &'static str, message: String) {
    let state = app.state::<AppState>();
    let line = match state.server_logs.lock() {
        Ok(mut buffer) => buffer.push(stream, message),
        Err(_) => return,
    };
    let _ = app.emit("server-log", line);
}

/// Current backlog of server output, oldest first.
#[tauri::command]
pub fn get_server_logs(state: State<'_, AppState>) -> Result<Vec<LogLine>, String> {
    let buffer = state
        .server_logs
        .lock()
        .map_err(|_| "log buffer is unavailable".to_string())?;
    Ok(buffer.lines.iter().cloned().collect())
}

/// Drop the backlog. Lines written after this still arrive as events.
#[tauri::command]
pub fn clear_server_logs(state: State<'_, AppState>) -> Result<(), String> {
    let mut buffer = state
        .server_logs
        .lock()
        .map_err(|_| "log buffer is unavailable".to_string())?;
    buffer.lines.clear();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{LogBuffer, MAX_LOG_LINES};

    #[test]
    fn keeps_only_the_newest_lines() {
        let mut buffer = LogBuffer::default();
        for i in 0..(MAX_LOG_LINES + 5) {
            buffer.push("stdout", format!("line {i}"));
        }
        assert_eq!(buffer.lines.len(), MAX_LOG_LINES);
        assert_eq!(buffer.lines.front().map(|l| l.seq), Some(5));
        assert_eq!(
            buffer.lines.back().map(|l| l.seq),
            Some(MAX_LOG_LINES as u64 + 4)
        );
    }

    #[test]
    fn sequence_numbers_increase_across_clears() {
        let mut buffer = LogBuffer::default();
        buffer.push("stderr", "a".into());
        buffer.lines.clear();
        let next = buffer.push("stderr", "b".into());
        assert_eq!(next.seq, 1);
    }
}

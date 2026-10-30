use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine};
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder};
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

use crate::entities::{benchmark_run, benchmark_run_step};

/// One finished or running benchmark run, as the runs table shows it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkRunSummaryDto {
    pub id: String,
    pub suite_id: Option<String>,
    pub suite_name: String,
    pub model_name: String,
    pub model_key: String,
    pub compute: String,
    pub mode: String,
    pub warmup_runs: i32,
    pub repetitions: i32,
    pub status: String,
    pub error: Option<String>,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub metrics: RunMetrics,
}

/// Figures for one run. Means and peaks use the timed passes that completed; the counts cover
/// every step of the run.
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunMetrics {
    pub steps_completed: i64,
    pub steps_failed: i64,
    pub steps_skipped: i64,
    pub mean_ttft_ms: Option<f64>,
    pub mean_tokens_per_sec: Option<f64>,
    pub mean_total_ms: Option<f64>,
    /// Keyword checks that passed, out of the checks made.
    pub keyword_passed: i64,
    pub keyword_checked: i64,
    pub peak_model_memory_bytes: Option<i64>,
    pub mean_cpu: Option<f64>,
    pub mean_gpu: Option<f64>,
    pub mean_npu: Option<f64>,
}

/// Figures for one run from its steps. Pure, so it can be tested without a database.
pub fn summarize(steps: &[benchmark_run_step::Model]) -> RunMetrics {
    let mut metrics = RunMetrics::default();
    for step in steps {
        match step.status.as_str() {
            "completed" => metrics.steps_completed += 1,
            "failed" => metrics.steps_failed += 1,
            _ => metrics.steps_skipped += 1,
        }
    }

    let timed: Vec<&benchmark_run_step::Model> = steps
        .iter()
        .filter(|s| s.status == "completed" && !s.is_warmup)
        .collect();
    metrics.mean_ttft_ms = mean(timed.iter().filter_map(|s| s.ttft_ms));
    metrics.mean_tokens_per_sec = mean(timed.iter().filter_map(|s| s.tokens_per_sec));
    metrics.mean_total_ms = mean(timed.iter().filter_map(|s| s.total_ms.map(|v| v as f64)));
    metrics.mean_cpu = mean(timed.iter().filter_map(|s| s.avg_cpu));
    metrics.mean_gpu = mean(timed.iter().filter_map(|s| s.avg_gpu));
    metrics.mean_npu = mean(timed.iter().filter_map(|s| s.avg_npu));
    metrics.peak_model_memory_bytes = timed
        .iter()
        .filter_map(|s| s.peak_model_memory_bytes)
        .max();

    for step in &timed {
        if let Some(passed) = step.passed {
            metrics.keyword_checked += 1;
            if passed {
                metrics.keyword_passed += 1;
            }
        }
    }
    metrics
}

fn mean(values: impl Iterator<Item = f64>) -> Option<f64> {
    let values: Vec<f64> = values.collect();
    if values.is_empty() {
        return None;
    }
    Some(values.iter().sum::<f64>() / values.len() as f64)
}

/// Every run, newest first, with its figures.
#[tauri::command]
pub async fn list_benchmark_runs(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<BenchmarkRunSummaryDto>, String> {
    list_runs(&db).await
}

/// One step of a run, with the model's reply, as the runs table's response view shows it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkRunStepDto {
    pub id: String,
    pub run_id: String,
    pub position: i32,
    pub repetition_index: i32,
    pub is_warmup: bool,
    pub prompt_name: String,
    pub prompt_text: String,
    pub output_text: Option<String>,
    pub ttft_ms: Option<f64>,
    pub total_ms: Option<i64>,
    pub tokens_per_sec: Option<f64>,
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub peak_model_memory_bytes: Option<i64>,
    pub avg_model_memory_bytes: Option<i64>,
    pub peak_memory_used_bytes: Option<i64>,
    pub avg_cpu: Option<f64>,
    pub avg_gpu: Option<f64>,
    pub avg_npu: Option<f64>,
    pub passed: Option<bool>,
    pub matched_keywords: Option<i32>,
    pub expected_keywords: Option<i32>,
    pub status: String,
    pub error: Option<String>,
}

impl From<benchmark_run_step::Model> for BenchmarkRunStepDto {
    fn from(step: benchmark_run_step::Model) -> Self {
        Self {
            id: step.id,
            run_id: step.run_id,
            position: step.position,
            repetition_index: step.repetition_index,
            is_warmup: step.is_warmup,
            prompt_name: step.prompt_name,
            prompt_text: step.prompt_text,
            output_text: step.output_text,
            ttft_ms: step.ttft_ms,
            total_ms: step.total_ms,
            tokens_per_sec: step.tokens_per_sec,
            prompt_tokens: step.prompt_tokens,
            completion_tokens: step.completion_tokens,
            peak_model_memory_bytes: step.peak_model_memory_bytes,
            avg_model_memory_bytes: step.avg_model_memory_bytes,
            peak_memory_used_bytes: step.peak_memory_used_bytes,
            avg_cpu: step.avg_cpu,
            avg_gpu: step.avg_gpu,
            avg_npu: step.avg_npu,
            passed: step.passed,
            matched_keywords: step.matched_keywords,
            expected_keywords: step.expected_keywords,
            status: step.status,
            error: step.error,
        }
    }
}

/// Every step of one run, in pass order: warm-up and timed passes, then the position in each pass.
#[tauri::command]
pub async fn get_benchmark_run_steps(
    db: State<'_, DatabaseConnection>,
    run_id: String,
) -> Result<Vec<BenchmarkRunStepDto>, String> {
    let steps = benchmark_run_step::Entity::find()
        .filter(benchmark_run_step::Column::RunId.eq(&run_id))
        .order_by_asc(benchmark_run_step::Column::RepetitionIndex)
        .order_by_asc(benchmark_run_step::Column::Position)
        .all(&*db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(steps.into_iter().map(BenchmarkRunStepDto::from).collect())
}

async fn list_runs(db: &DatabaseConnection) -> Result<Vec<BenchmarkRunSummaryDto>, String> {
    let runs = benchmark_run::Entity::find()
        .order_by_desc(benchmark_run::Column::StartedAt)
        .all(db)
        .await
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(runs.len());
    for run in runs {
        let steps = benchmark_run_step::Entity::find()
            .filter(benchmark_run_step::Column::RunId.eq(&run.id))
            .all(db)
            .await
            .map_err(|e| e.to_string())?;
        let metrics = summarize(&steps);
        out.push(BenchmarkRunSummaryDto {
            id: run.id,
            suite_id: run.suite_id,
            suite_name: run.suite_name,
            model_name: run.model_name,
            model_key: run.model_key,
            compute: run.compute,
            mode: run.mode,
            warmup_runs: run.warmup_runs,
            repetitions: run.repetitions,
            status: run.status,
            error: run.error,
            started_at: run.started_at,
            finished_at: run.finished_at,
            metrics,
        });
    }
    Ok(out)
}

/// Ask where to save, then write `bytes` there. Resolves to the saved path, or null when the user cancels.
pub(super) async fn save_with_dialog(
    app: &AppHandle,
    bytes: Vec<u8>,
    default_name: &str,
    filter_label: &str,
    extension: &str,
) -> Result<Option<String>, String> {
    let (tx, rx) = oneshot::channel();
    app.dialog()
        .file()
        .add_filter(filter_label, &[extension])
        .set_file_name(default_name)
        .save_file(move |picked| {
            let _ = tx.send(picked);
        });
    let picked = rx
        .await
        .map_err(|e| format!("save dialog closed unexpectedly: {e}"))?;
    match picked {
        None => Ok(None),
        Some(file) => {
            let path = file
                .into_path()
                .map_err(|e| format!("the chosen location has no local path: {e}"))?;
            tokio::fs::write(&path, &bytes)
                .await
                .map_err(|e| format!("could not write the file: {e}"))?;
            Ok(Some(path.to_string_lossy().into_owned()))
        }
    }
}

/// Save the CSV text of the runs table.
#[tauri::command]
pub async fn save_benchmark_export(
    app: AppHandle,
    content: String,
    default_name: String,
) -> Result<Option<String>, String> {
    save_with_dialog(&app, content.into_bytes(), &default_name, "CSV", "csv").await
}

/// Save a chart image. `data_base64` is the PNG's bytes, base64 encoded.
#[tauri::command]
pub async fn save_benchmark_image(
    app: AppHandle,
    data_base64: String,
    default_name: String,
) -> Result<Option<String>, String> {
    let bytes = STANDARD
        .decode(data_base64)
        .map_err(|e| format!("invalid image data: {e}"))?;
    save_with_dialog(&app, bytes, &default_name, "PNG image", "png").await
}

/// Open an exported CSV or PNG in its default app. Only .csv and .png files that still exist are opened.
#[tauri::command]
pub async fn open_benchmark_export(path: String) -> Result<(), String> {
    let file = Path::new(&path);
    let is_export = file
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("csv") || e.eq_ignore_ascii_case("png"));
    if !is_export {
        return Err("Only exported CSV and PNG files can be opened here.".to_string());
    }
    if !file.is_file() {
        return Err(format!("{path} is no longer there."));
    }
    open_in_default_app(file)
}

/// Explorer opens a file in the app registered for its type.
#[cfg(target_os = "windows")]
fn open_in_default_app(file: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("explorer")
        .arg(file)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("could not open the file: {e}"))
}

#[cfg(not(target_os = "windows"))]
fn open_in_default_app(_file: &Path) -> Result<(), String> {
    Err("Opening the file is only supported on Windows.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(status: &str, warmup: bool, ttft: Option<f64>, tps: Option<f64>) -> benchmark_run_step::Model {
        benchmark_run_step::Model {
            id: format!("s-{status}-{warmup}-{ttft:?}"),
            run_id: "r1".into(),
            position: 0,
            repetition_index: 0,
            is_warmup: warmup,
            prompt_name: "P".into(),
            prompt_text: "T".into(),
            output_text: None,
            ttft_ms: ttft,
            total_ms: Some(1000),
            tokens_per_sec: tps,
            prompt_tokens: None,
            completion_tokens: None,
            peak_model_memory_bytes: Some(100),
            avg_model_memory_bytes: None,
            peak_memory_used_bytes: None,
            avg_cpu: Some(10.0),
            avg_gpu: None,
            avg_npu: Some(50.0),
            passed: Some(true),
            matched_keywords: None,
            expected_keywords: None,
            status: status.into(),
            error: None,
        }
    }

    #[test]
    fn means_use_completed_timed_steps_only() {
        let steps = vec![
            step("completed", true, Some(900.0), Some(1.0)),
            step("completed", false, Some(100.0), Some(20.0)),
            step("completed", false, Some(300.0), Some(40.0)),
            step("failed", false, None, None),
            step("skipped", false, None, None),
        ];
        let m = summarize(&steps);
        assert_eq!(m.steps_completed, 3);
        assert_eq!(m.steps_failed, 1);
        assert_eq!(m.steps_skipped, 1);
        assert_eq!(m.mean_ttft_ms, Some(200.0));
        assert_eq!(m.mean_tokens_per_sec, Some(30.0));
        assert_eq!(m.keyword_checked, 2);
        assert_eq!(m.keyword_passed, 2);
        assert_eq!(m.mean_npu, Some(50.0));
        assert_eq!(m.mean_gpu, None);
    }

    #[test]
    fn a_run_with_no_completed_timed_steps_has_no_means() {
        let m = summarize(&[step("failed", false, None, None)]);
        assert_eq!(m.mean_ttft_ms, None);
        assert_eq!(m.peak_model_memory_bytes, None);
    }
}

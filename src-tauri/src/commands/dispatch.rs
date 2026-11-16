//! Dispatch (agent mode). A task is a chat session of kind `dispatch` plus one `dispatch_tasks` row.
//! The runner is in the frontend; this module stores a task, its status, notes, report and error. A
//! task is a long-lived conversation with no step or time limit, so its stored limits are zeros. The
//! messages live in the task's session.

use std::str::FromStr;

use sea_orm::sea_query::Expr;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
    TransactionTrait,
};
use serde::{Deserialize, Deserializer, Serialize};

use super::database::{now_millis, remove_session};
use crate::entities::{chat_session, dispatch_task};

/// The session title is the goal cut to this many characters.
const TITLE_CHARS: usize = 60;
/// The notes a task keeps, in characters. A longer text is cut.
const NOTES_CHARS: usize = 1500;
/// The limits every new task stores. Zero means no limit.
const NO_LIMITS: Limits = Limits {
    max_steps: 0,
    max_minutes: 0,
};
/// Every task's session runs compaction on at the 70 percent threshold (the per-chat override).
const TASK_SESSION_OVERRIDES: &str = r#"{"compaction":true,"compactionThreshold":70}"#;

// ─── Types ─────────────────────────────────────────────────────────

/// Where a task stands. Stored and sent as its snake_case name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DispatchStatus {
    Queued,
    Running,
    NeedsYou,
    Done,
    Failed,
    Stopped,
    Interrupted,
}

impl DispatchStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::NeedsYou => "needs_you",
            Self::Done => "done",
            Self::Failed => "failed",
            Self::Stopped => "stopped",
            Self::Interrupted => "interrupted",
        }
    }
}

impl FromStr for DispatchStatus {
    type Err = String;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        match text {
            "queued" => Ok(Self::Queued),
            "running" => Ok(Self::Running),
            "needs_you" => Ok(Self::NeedsYou),
            "done" => Ok(Self::Done),
            "failed" => Ok(Self::Failed),
            "stopped" => Ok(Self::Stopped),
            "interrupted" => Ok(Self::Interrupted),
            other => Err(format!("unknown dispatch status: {other}")),
        }
    }
}

/// Step and minute caps stored with a task. A zero means no limit. New tasks store zeros.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub max_steps: u32,
    pub max_minutes: u32,
}

/// A task as the frontend sees it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DispatchTask {
    pub id: String,
    pub session_id: String,
    pub goal: String,
    pub status: DispatchStatus,
    pub allowed_tools: Vec<String>,
    pub limits: Limits,
    pub notes: String,
    pub report: Option<String>,
    pub error: Option<String>,
    pub steps: u32,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
}

/// The fields of a task that change. A field left out keeps its value. For `report` and `error`, an
/// explicit `null` clears the field and a value sets it.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DispatchPatch {
    pub status: Option<DispatchStatus>,
    pub notes: Option<String>,
    #[serde(default, deserialize_with = "present_or_null")]
    pub report: Option<Option<String>>,
    #[serde(default, deserialize_with = "present_or_null")]
    pub error: Option<Option<String>>,
    pub steps: Option<u32>,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
}

/// Reads a field that may be `null`. A `null` becomes `Some(None)`, so the patch clears the field. A
/// missing field stays `None` through `#[serde(default)]`, so the patch leaves it alone.
fn present_or_null<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
}

// ─── Pure rules ────────────────────────────────────────────────────

/// The goal without its surrounding spaces. An empty goal is refused.
pub fn validate_goal(goal: &str) -> Result<String, String> {
    let goal = goal.trim();
    if goal.is_empty() {
        return Err("A Dispatch task needs a goal.".to_owned());
    }
    Ok(goal.to_owned())
}

/// Tool names, trimmed and without repeats, in the order given. An empty name is refused.
pub fn validate_tools(names: Vec<String>) -> Result<Vec<String>, String> {
    let mut kept: Vec<String> = Vec::with_capacity(names.len());
    for name in names {
        let name = name.trim();
        if name.is_empty() {
            return Err("A tool name cannot be empty.".to_owned());
        }
        if !kept.iter().any(|known| known == name) {
            kept.push(name.to_owned());
        }
    }
    Ok(kept)
}

/// The first `max` characters of `text`. The cut falls between characters, never inside one.
pub fn cut_chars(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

/// Applies `patch` to `task`. Notes are cut to the notes length.
pub fn apply_patch(task: &mut DispatchTask, patch: DispatchPatch) {
    if let Some(status) = patch.status {
        task.status = status;
    }
    if let Some(notes) = patch.notes {
        task.notes = cut_chars(&notes, NOTES_CHARS);
    }
    if let Some(report) = patch.report {
        task.report = report;
    }
    if let Some(error) = patch.error {
        task.error = error;
    }
    if let Some(steps) = patch.steps {
        task.steps = steps;
    }
    if let Some(started_at) = patch.started_at {
        task.started_at = Some(started_at);
    }
    if let Some(finished_at) = patch.finished_at {
        task.finished_at = Some(finished_at);
    }
}

// ─── Rows ──────────────────────────────────────────────────────────

fn task_from_row(row: dispatch_task::Model) -> Result<DispatchTask, String> {
    Ok(DispatchTask {
        status: row.status.parse()?,
        allowed_tools: serde_json::from_str(&row.allowed_tools)
            .map_err(|e| format!("stored allowed tools are unreadable: {e}"))?,
        limits: serde_json::from_str(&row.limits)
            .map_err(|e| format!("stored limits are unreadable: {e}"))?,
        steps: u32::try_from(row.steps).unwrap_or(u32::MAX),
        id: row.id,
        session_id: row.session_id,
        goal: row.goal,
        notes: row.notes,
        report: row.report,
        error: row.error,
        created_at: row.created_at,
        started_at: row.started_at,
        finished_at: row.finished_at,
    })
}

fn row_from_task(task: &DispatchTask) -> Result<dispatch_task::Model, String> {
    Ok(dispatch_task::Model {
        id: task.id.clone(),
        session_id: task.session_id.clone(),
        goal: task.goal.clone(),
        status: task.status.as_str().to_owned(),
        allowed_tools: serde_json::to_string(&task.allowed_tools).map_err(|e| e.to_string())?,
        limits: serde_json::to_string(&task.limits).map_err(|e| e.to_string())?,
        notes: task.notes.clone(),
        report: task.report.clone(),
        error: task.error.clone(),
        steps: i64::from(task.steps),
        created_at: task.created_at,
        started_at: task.started_at,
        finished_at: task.finished_at,
    })
}

/// Every column set, so an update writes the whole row. `into_active_model` would mark them unchanged.
fn active_row(row: dispatch_task::Model) -> dispatch_task::ActiveModel {
    dispatch_task::ActiveModel {
        id: Set(row.id),
        session_id: Set(row.session_id),
        goal: Set(row.goal),
        status: Set(row.status),
        allowed_tools: Set(row.allowed_tools),
        limits: Set(row.limits),
        notes: Set(row.notes),
        report: Set(row.report),
        error: Set(row.error),
        steps: Set(row.steps),
        created_at: Set(row.created_at),
        started_at: Set(row.started_at),
        finished_at: Set(row.finished_at),
    }
}

// ─── Database ──────────────────────────────────────────────────────

/// Every task, newest first.
pub async fn list_tasks(db: &DatabaseConnection) -> Result<Vec<DispatchTask>, String> {
    dispatch_task::Entity::find()
        .order_by_desc(dispatch_task::Column::CreatedAt)
        .order_by_desc(dispatch_task::Column::Id)
        .all(db)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(task_from_row)
        .collect()
}

/// Creates a task and its dispatch session in one transaction. The task starts queued with no limits.
pub async fn create_task(
    db: &DatabaseConnection,
    goal: &str,
    allowed_tools: Vec<String>,
) -> Result<DispatchTask, String> {
    let goal = validate_goal(goal)?;
    let allowed_tools = validate_tools(allowed_tools)?;
    let now = now_millis();
    let task = DispatchTask {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: uuid::Uuid::new_v4().to_string(),
        goal,
        status: DispatchStatus::Queued,
        allowed_tools,
        limits: NO_LIMITS,
        notes: String::new(),
        report: None,
        error: None,
        steps: 0,
        created_at: now,
        started_at: None,
        finished_at: None,
    };
    let session = chat_session::ActiveModel {
        id: Set(task.session_id.clone()),
        title: Set(cut_chars(&task.goal, TITLE_CHARS)),
        model_id: Set(None),
        context_chars: Set(0),
        created_at: Set(now),
        updated_at: Set(now),
        pinned: Set(false),
        settings_overrides: Set(Some(TASK_SESSION_OVERRIDES.to_owned())),
        kind: Set(chat_session::KIND_DISPATCH.to_owned()),
    };
    let row = active_row(row_from_task(&task)?);

    let txn = db.begin().await.map_err(|e| e.to_string())?;
    session.insert(&txn).await.map_err(|e| e.to_string())?;
    row.insert(&txn).await.map_err(|e| e.to_string())?;
    txn.commit().await.map_err(|e| e.to_string())?;
    Ok(task)
}

/// Applies `patch` to a task and returns it as stored. A missing task is an error.
pub async fn update_task(
    db: &DatabaseConnection,
    id: &str,
    patch: DispatchPatch,
) -> Result<DispatchTask, String> {
    let txn = db.begin().await.map_err(|e| e.to_string())?;
    let row = dispatch_task::Entity::find_by_id(id)
        .one(&txn)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Dispatch task not found.".to_owned())?;
    let mut task = task_from_row(row)?;
    apply_patch(&mut task, patch);
    active_row(row_from_task(&task)?)
        .update(&txn)
        .await
        .map_err(|e| e.to_string())?;
    txn.commit().await.map_err(|e| e.to_string())?;
    Ok(task)
}

/// Deletes a task, its session and the session's messages in one transaction. A missing task is a
/// no-op.
pub async fn delete_task(db: &DatabaseConnection, id: &str) -> Result<(), String> {
    let txn = db.begin().await.map_err(|e| e.to_string())?;
    let Some(row) = dispatch_task::Entity::find_by_id(id)
        .one(&txn)
        .await
        .map_err(|e| e.to_string())?
    else {
        return Ok(());
    };
    dispatch_task::Entity::delete_by_id(id)
        .exec(&txn)
        .await
        .map_err(|e| e.to_string())?;
    remove_session(&txn, &row.session_id).await?;
    txn.commit().await.map_err(|e| e.to_string())
}

/// Marks every task that was queued, running or waiting for an approval (`needs_you`) as interrupted.
/// Run once at startup, since a restart ended them. Returns how many tasks changed.
pub async fn interrupt_unfinished(db: &DatabaseConnection) -> Result<u64, String> {
    let unfinished = [
        DispatchStatus::Queued.as_str(),
        DispatchStatus::Running.as_str(),
        DispatchStatus::NeedsYou.as_str(),
    ];
    let result = dispatch_task::Entity::update_many()
        .col_expr(
            dispatch_task::Column::Status,
            Expr::value(DispatchStatus::Interrupted.as_str()),
        )
        .filter(dispatch_task::Column::Status.is_in(unfinished))
        .exec(db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(result.rows_affected)
}

// ─── Commands ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn dispatch_list(
    db: tauri::State<'_, DatabaseConnection>,
) -> Result<Vec<DispatchTask>, String> {
    list_tasks(&db).await
}

#[tauri::command]
pub async fn dispatch_create(
    db: tauri::State<'_, DatabaseConnection>,
    goal: String,
    allowed_tools: Vec<String>,
) -> Result<DispatchTask, String> {
    create_task(&db, &goal, allowed_tools).await
}

#[tauri::command]
pub async fn dispatch_update(
    db: tauri::State<'_, DatabaseConnection>,
    id: String,
    patch: DispatchPatch,
) -> Result<DispatchTask, String> {
    update_task(&db, &id, patch).await
}

#[tauri::command]
pub async fn dispatch_delete(
    db: tauri::State<'_, DatabaseConnection>,
    id: String,
) -> Result<(), String> {
    delete_task(&db, &id).await
}

// ─── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::database::init_database;
    use crate::commands::database::test_support::TempDb;
    use crate::entities::message;

    const ALL_STATUSES: [DispatchStatus; 7] = [
        DispatchStatus::Queued,
        DispatchStatus::Running,
        DispatchStatus::NeedsYou,
        DispatchStatus::Done,
        DispatchStatus::Failed,
        DispatchStatus::Stopped,
        DispatchStatus::Interrupted,
    ];

    fn limits(max_steps: u32, max_minutes: u32) -> Limits {
        Limits {
            max_steps,
            max_minutes,
        }
    }

    fn sample_task() -> DispatchTask {
        DispatchTask {
            id: "t1".into(),
            session_id: "s1".into(),
            goal: "Read the notes".into(),
            status: DispatchStatus::Running,
            allowed_tools: vec!["read".into()],
            limits: limits(40, 60),
            notes: String::new(),
            report: Some("old report".into()),
            error: Some("old error".into()),
            steps: 3,
            created_at: 1,
            started_at: Some(2),
            finished_at: None,
        }
    }

    #[test]
    fn statuses_round_trip_through_their_text_and_json() {
        for status in ALL_STATUSES {
            let text = status.as_str();
            assert_eq!(text.parse::<DispatchStatus>(), Ok(status));
            assert_eq!(
                serde_json::to_string(&status).expect("serialize"),
                format!("\"{text}\"")
            );
            let read: DispatchStatus =
                serde_json::from_str(&format!("\"{text}\"")).expect("deserialize");
            assert_eq!(read, status);
        }
        assert!("Needs You".parse::<DispatchStatus>().is_err());
    }

    #[test]
    fn goal_is_trimmed_and_an_empty_goal_is_refused() {
        assert_eq!(
            validate_goal("  Find the notes \n").as_deref(),
            Ok("Find the notes")
        );
        assert!(validate_goal("   ").is_err());
        assert!(validate_goal("").is_err());
    }

    #[test]
    fn tools_are_trimmed_deduplicated_and_empty_names_refused() {
        let kept = validate_tools(vec![" read ".into(), "read".into(), "web".into()]);
        assert_eq!(kept, Ok(vec!["read".to_owned(), "web".to_owned()]));
        assert!(validate_tools(vec!["read".into(), " ".into()]).is_err());
        assert_eq!(validate_tools(vec![]), Ok(vec![]));
    }

    #[test]
    fn title_is_the_goal_cut_to_sixty_characters() {
        let long = "a".repeat(70);
        assert_eq!(cut_chars(&long, TITLE_CHARS), "a".repeat(60));
        // Multi-byte characters count as one each, so the cut never splits one.
        let accents = "é".repeat(70);
        assert_eq!(cut_chars(&accents, TITLE_CHARS), "é".repeat(60));
        assert_eq!(cut_chars("short", TITLE_CHARS), "short");
    }

    #[test]
    fn notes_are_cut_to_the_notes_length_on_a_character_boundary() {
        let mut task = sample_task();
        apply_patch(
            &mut task,
            DispatchPatch {
                notes: Some("ü".repeat(1600)),
                ..DispatchPatch::default()
            },
        );
        assert_eq!(task.notes.chars().count(), NOTES_CHARS);
        assert!(task.notes.chars().all(|c| c == 'ü'));
    }

    #[test]
    fn patch_leaves_missing_fields_and_clears_on_null() {
        let mut task = sample_task();
        let patch: DispatchPatch =
            serde_json::from_str(r#"{"status":"needs_you","report":null,"steps":5}"#)
                .expect("patch");
        apply_patch(&mut task, patch);
        assert_eq!(task.status, DispatchStatus::NeedsYou);
        assert_eq!(task.report, None);
        assert_eq!(task.error.as_deref(), Some("old error"));
        assert_eq!(task.steps, 5);
        assert_eq!(task.started_at, Some(2));
        assert_eq!(task.notes, "");
    }

    #[test]
    fn patch_json_tells_a_missing_null_and_a_value_apart() {
        let missing: DispatchPatch = serde_json::from_str("{}").expect("empty");
        assert_eq!(missing.report, None);
        assert_eq!(missing.error, None);

        let null: DispatchPatch =
            serde_json::from_str(r#"{"report":null,"error":null}"#).expect("nulls");
        assert_eq!(null.report, Some(None));
        assert_eq!(null.error, Some(None));

        let value: DispatchPatch = serde_json::from_str(r#"{"report":"done"}"#).expect("value");
        assert_eq!(value.report, Some(Some("done".to_owned())));
    }

    #[test]
    fn patch_sets_a_report_and_an_error() {
        let mut task = sample_task();
        task.report = None;
        task.error = None;
        apply_patch(
            &mut task,
            DispatchPatch {
                report: Some(Some("Found it".into())),
                error: Some(Some("timed out".into())),
                finished_at: Some(9),
                ..DispatchPatch::default()
            },
        );
        assert_eq!(task.report.as_deref(), Some("Found it"));
        assert_eq!(task.error.as_deref(), Some("timed out"));
        assert_eq!(task.finished_at, Some(9));
    }

    #[test]
    fn task_json_is_camel_case_and_sends_empty_fields_as_null() {
        let mut task = sample_task();
        task.report = None;
        task.started_at = None;
        let json = serde_json::to_value(&task).expect("serialize");
        assert_eq!(json["sessionId"], "s1");
        assert_eq!(json["allowedTools"], serde_json::json!(["read"]));
        assert_eq!(
            json["limits"],
            serde_json::json!({"maxSteps": 40, "maxMinutes": 60})
        );
        assert_eq!(json["status"], "running");
        assert_eq!(json["createdAt"], 1);
        assert!(json["report"].is_null());
        assert!(json["startedAt"].is_null());
        assert!(json.get("session_id").is_none());
    }

    #[test]
    fn stored_limits_json_matches_the_frontend_shape() {
        let text = serde_json::to_string(&limits(40, 60)).expect("serialize");
        assert_eq!(text, r#"{"maxSteps":40,"maxMinutes":60}"#);
    }

    #[test]
    fn task_session_overrides_turn_compaction_on_at_seventy() {
        let value: serde_json::Value = serde_json::from_str(TASK_SESSION_OVERRIDES).expect("json");
        assert_eq!(value["compaction"], true);
        assert_eq!(value["compactionThreshold"], 70);
        assert!(crate::model_settings::validate_chat_overrides(TASK_SESSION_OVERRIDES).is_ok());
    }

    async fn open(name: &str) -> (TempDb, DatabaseConnection) {
        let tmp = TempDb::new(name);
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        (tmp, db)
    }

    #[tokio::test]
    async fn create_update_and_delete_round_trip() {
        let (_tmp, db) = open("dispatch-round-trip").await;

        let created = create_task(
            &db,
            "  Find the report and summarise it for the team meeting tomorrow morning  ",
            vec!["read".into(), "read".into()],
        )
        .await
        .expect("create");
        assert_eq!(created.status, DispatchStatus::Queued);
        assert_eq!(created.allowed_tools, vec!["read".to_owned()]);
        assert_eq!(created.steps, 0);
        assert_eq!(created.notes, "");

        let session = chat_session::Entity::find_by_id(created.session_id.as_str())
            .one(&db)
            .await
            .expect("query")
            .expect("session row");
        assert_eq!(session.kind, chat_session::KIND_DISPATCH);
        assert_eq!(session.title.chars().count(), TITLE_CHARS);
        assert!(session.title.starts_with("Find the report"));
        assert_eq!(session.model_id, None);
        assert_eq!(session.context_chars, 0);
        assert_eq!(
            session.settings_overrides.as_deref(),
            Some(TASK_SESSION_OVERRIDES)
        );

        message::ActiveModel {
            id: Set("m1".into()),
            session_id: Set(created.session_id.clone()),
            role: Set("user".into()),
            content: Set("hello".into()),
            created_at: Set(1),
            kind: Set("text".into()),
            ..Default::default()
        }
        .insert(&db)
        .await
        .expect("insert message");

        let running = update_task(
            &db,
            &created.id,
            DispatchPatch {
                status: Some(DispatchStatus::Running),
                started_at: Some(5),
                steps: Some(2),
                notes: Some("1. open the folder".into()),
                ..DispatchPatch::default()
            },
        )
        .await
        .expect("update");
        assert_eq!(running.status, DispatchStatus::Running);
        assert_eq!(running.started_at, Some(5));
        assert_eq!(running.steps, 2);

        let listed = list_tasks(&db).await.expect("list");
        assert_eq!(listed, vec![running]);

        delete_task(&db, &created.id).await.expect("delete");
        assert!(list_tasks(&db).await.expect("list").is_empty());
        assert!(
            chat_session::Entity::find_by_id(created.session_id.as_str())
                .one(&db)
                .await
                .expect("query")
                .is_none()
        );
        assert!(message::Entity::find()
            .all(&db)
            .await
            .expect("query")
            .is_empty());
        delete_task(&db, &created.id)
            .await
            .expect("a missing task is a no-op");
    }

    #[tokio::test]
    async fn create_needs_no_limits_and_stores_zeros() {
        let (_tmp, db) = open("dispatch-no-limits").await;
        let created = create_task(&db, "Tidy the notes folder", vec![])
            .await
            .expect("create");
        assert_eq!(created.limits, limits(0, 0));

        let row = dispatch_task::Entity::find_by_id(created.id.as_str())
            .one(&db)
            .await
            .expect("query")
            .expect("task row");
        assert_eq!(row.limits, r#"{"maxSteps":0,"maxMinutes":0}"#);
    }

    #[tokio::test]
    async fn create_refuses_an_empty_goal_and_stores_nothing() {
        let (_tmp, db) = open("dispatch-refuse").await;
        assert!(create_task(&db, " ", vec![]).await.is_err());
        assert!(create_task(&db, "", vec![]).await.is_err());
        assert!(list_tasks(&db).await.expect("list").is_empty());
        assert!(chat_session::Entity::find()
            .all(&db)
            .await
            .expect("query")
            .is_empty());
    }

    #[tokio::test]
    async fn update_of_a_missing_task_is_an_error() {
        let (_tmp, db) = open("dispatch-missing").await;
        let result = update_task(&db, "nope", DispatchPatch::default()).await;
        assert_eq!(result, Err("Dispatch task not found.".to_owned()));
    }

    #[tokio::test]
    async fn list_puts_the_newest_task_first() {
        let (_tmp, db) = open("dispatch-order").await;
        let first = create_task(&db, "first", vec![]).await.expect("first");
        tokio::time::sleep(std::time::Duration::from_millis(3)).await;
        let second = create_task(&db, "second", vec![]).await.expect("second");
        let ids: Vec<String> = list_tasks(&db)
            .await
            .expect("list")
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert_eq!(ids, vec![second.id, first.id]);
    }

    #[tokio::test]
    async fn interrupt_moves_queued_running_and_waiting_and_keeps_the_rest() {
        let (_tmp, db) = open("dispatch-interrupt").await;
        let mut ids = Vec::new();
        for goal in ["queued", "running", "needs you", "done"] {
            let task = create_task(&db, goal, vec![]).await.expect("create");
            ids.push(task.id);
        }
        let statuses = [
            None,
            Some(DispatchStatus::Running),
            Some(DispatchStatus::NeedsYou),
            Some(DispatchStatus::Done),
        ];
        for (id, status) in ids.iter().zip(statuses) {
            if let Some(status) = status {
                update_task(
                    &db,
                    id,
                    DispatchPatch {
                        status: Some(status),
                        ..DispatchPatch::default()
                    },
                )
                .await
                .expect("set status");
            }
        }

        assert_eq!(interrupt_unfinished(&db).await, Ok(3));
        let by_goal: Vec<(String, DispatchStatus)> = list_tasks(&db)
            .await
            .expect("list")
            .into_iter()
            .map(|t| (t.goal, t.status))
            .collect();
        let status_of = |goal: &str| {
            by_goal
                .iter()
                .find(|(g, _)| g == goal)
                .map(|(_, s)| *s)
                .expect("task")
        };
        assert_eq!(status_of("queued"), DispatchStatus::Interrupted);
        assert_eq!(status_of("running"), DispatchStatus::Interrupted);
        assert_eq!(status_of("needs you"), DispatchStatus::Interrupted);
        assert_eq!(status_of("done"), DispatchStatus::Done);
        assert_eq!(interrupt_unfinished(&db).await, Ok(0));
    }
}

use std::collections::HashMap;

use sea_orm::prelude::*;
use sea_orm::sea_query::{Expr, OnConflict};
use sea_orm::{
    ColumnTrait, Database, DatabaseBackend, DatabaseConnection, EntityTrait, QueryFilter,
    QueryOrder, Set, Statement, TransactionTrait,
};
use sea_orm_migration::MigratorTrait;
use serde::{Deserialize, Serialize};

use super::capability_scan;
use super::ram_store;
use crate::entities::{chat_error, chat_session, downloaded_model, message, user_preference};
use crate::migrations::Migrator;
use crate::model_settings;

// ─── Types ─────────────────────────────────────────────────────────

/// Full session with messages and chat errors — returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSessionWithMessages {
    #[serde(flatten)]
    pub session: chat_session::Model,
    pub messages: Vec<message::Model>,
    pub errors: Vec<chat_error::Model>,
}

// ─── Initialisation ────────────────────────────────────────────────

pub async fn init_database(db_path: &str) -> Result<DatabaseConnection, String> {
    let db = Database::connect(db_path)
        .await
        .map_err(|e| format!("Failed to open database: {e}"))?;

    // Enable foreign keys for SQLite (per-connection).
    db.execute(Statement::from_string(
        DatabaseBackend::Sqlite,
        "PRAGMA foreign_keys = ON".to_owned(),
    ))
    .await
    .map_err(|e| format!("Failed to enable foreign keys: {e}"))?;

    // Apply all pending migrations (with up/down support).
    Migrator::up(&db, None)
        .await
        .map_err(|e| format!("Failed to run migrations: {e}"))?;

    Ok(db)
}

// ─── Sessions ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn load_sessions(
    db: tauri::State<'_, DatabaseConnection>,
) -> Result<Vec<ChatSessionWithMessages>, String> {
    let sessions = chat_session::Entity::find()
        .order_by_desc(chat_session::Column::Pinned)
        .order_by_desc(chat_session::Column::UpdatedAt)
        .all(&*db)
        .await
        .map_err(|e| e.to_string())?;

    // Batch-load all messages in one query instead of N+1
    let session_ids: Vec<String> = sessions.iter().map(|s| s.id.clone()).collect();

    let all_messages = if session_ids.is_empty() {
        vec![]
    } else {
        message::Entity::find()
            .filter(message::Column::SessionId.is_in(&session_ids))
            .order_by_asc(message::Column::CreatedAt)
            .order_by_asc(message::Column::Id)
            .all(&*db)
            .await
            .map_err(|e| e.to_string())?
    };

    let all_errors = if session_ids.is_empty() {
        vec![]
    } else {
        chat_error::Entity::find()
            .filter(chat_error::Column::SessionId.is_in(&session_ids))
            .order_by_asc(chat_error::Column::CreatedAt)
            .all(&*db)
            .await
            .map_err(|e| e.to_string())?
    };

    // Group messages by session_id (messages arrive ordered by created_at).
    let mut msgs_by_session: HashMap<String, Vec<message::Model>> = HashMap::new();
    for msg in all_messages {
        msgs_by_session
            .entry(msg.session_id.clone())
            .or_default()
            .push(msg);
    }
    let mut errors_by_session: HashMap<String, Vec<chat_error::Model>> = HashMap::new();
    for err in all_errors {
        errors_by_session
            .entry(err.session_id.clone())
            .or_default()
            .push(err);
    }

    Ok(sessions
        .into_iter()
        .map(|s| {
            let messages = msgs_by_session.remove(&s.id).unwrap_or_default();
            let errors = errors_by_session.remove(&s.id).unwrap_or_default();
            ChatSessionWithMessages {
                session: s,
                messages,
                errors,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn save_session(
    db: tauri::State<'_, DatabaseConnection>,
    session: chat_session::Model,
) -> Result<(), String> {
    if let Some(overrides) = &session.settings_overrides {
        model_settings::validate_chat_overrides(overrides)?;
    }
    chat_session::Entity::insert(chat_session::ActiveModel {
        id: Set(session.id),
        title: Set(session.title),
        model_id: Set(session.model_id),
        context_chars: Set(session.context_chars),
        created_at: Set(session.created_at),
        updated_at: Set(session.updated_at),
        pinned: Set(session.pinned),
        settings_overrides: Set(session.settings_overrides),
    })
    .on_conflict(
        OnConflict::column(chat_session::Column::Id)
            .update_columns([
                chat_session::Column::Title,
                chat_session::Column::ModelId,
                chat_session::Column::ContextChars,
                chat_session::Column::CreatedAt,
                chat_session::Column::UpdatedAt,
                chat_session::Column::Pinned,
                chat_session::Column::SettingsOverrides,
            ])
            .to_owned(),
    )
    .exec(&*db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_session(
    db: tauri::State<'_, DatabaseConnection>,
    id: String,
) -> Result<(), String> {
    // Messages, errors and the session row go together or not at all.
    let txn = db.begin().await.map_err(|e| e.to_string())?;
    message::Entity::delete_many()
        .filter(message::Column::SessionId.eq(&id))
        .exec(&txn)
        .await
        .map_err(|e| e.to_string())?;
    chat_error::Entity::delete_many()
        .filter(chat_error::Column::SessionId.eq(&id))
        .exec(&txn)
        .await
        .map_err(|e| e.to_string())?;
    chat_session::Entity::delete_by_id(&id)
        .exec(&txn)
        .await
        .map_err(|e| e.to_string())?;
    txn.commit().await.map_err(|e| e.to_string())
}

// ─── Messages ──────────────────────────────────────────────────────

/// The system type of a compaction summary. Only a summary names the messages it covers.
const SYSTEM_TYPE_SUMMARY: &str = "summary";

/// A system type is made of lowercase letters and underscores.
fn is_system_type(kind: &str) -> bool {
    !kind.is_empty() && kind.chars().all(|c| c.is_ascii_lowercase() || c == '_')
}

/// A chat message is `text` with no system type. A tool message is `tool`, with no system type, and holds
/// the result of one call. A system line is `system` and needs a type made of lowercase letters and
/// underscores. A summary needs the id of the last message it covers, and no other message may name one.
/// Anything else is refused, so a bad row never reaches the history.
fn check_message_kind(message: &message::Model) -> Result<(), String> {
    let covers = message.covers_through_id.as_deref();
    match (message.kind.as_str(), message.system_type.as_deref()) {
        ("text", None) => refuse_covers(covers),
        ("text", Some(_)) => Err("a chat message cannot have a system type".to_owned()),
        ("tool", None) => refuse_covers(covers),
        ("tool", Some(_)) => Err("a tool message cannot have a system type".to_owned()),
        ("system", Some(SYSTEM_TYPE_SUMMARY)) => match covers {
            Some(id) if !id.is_empty() => Ok(()),
            _ => Err("a summary needs the id of the last message it covers".to_owned()),
        },
        ("system", Some(kind)) if is_system_type(kind) => refuse_covers(covers),
        ("system", _) => Err("a system message needs a system type".to_owned()),
        (other, _) => Err(format!("unknown message kind: {other}")),
    }
}

/// Only a summary may name the messages it covers.
fn refuse_covers(covers: Option<&str>) -> Result<(), String> {
    match covers {
        None => Ok(()),
        Some(_) => Err("only a summary can cover earlier messages".to_owned()),
    }
}

#[tauri::command]
pub async fn save_message(
    db: tauri::State<'_, DatabaseConnection>,
    session_id: String,
    message: message::Model,
) -> Result<(), String> {
    check_message_kind(&message)?;
    // A reply names the model that produced it, so it can be checked for thinking evidence.
    let reply_evidence = match (message.role.as_str(), message.model_id.as_deref()) {
        ("assistant", Some(model)) => Some((model.to_owned(), message.content.clone())),
        _ => None,
    };
    message::Entity::insert(message::ActiveModel {
        id: Set(message.id),
        session_id: Set(session_id.clone()),
        role: Set(message.role),
        content: Set(message.content),
        model_id: Set(message.model_id),
        created_at: Set(message.created_at),
        finish_reason: Set(message.finish_reason),
        time_to_first_token_ms: Set(message.time_to_first_token_ms),
        total_time_ms: Set(message.total_time_ms),
        token_count: Set(message.token_count),
        prompt_chars: Set(message.prompt_chars),
        attachments: Set(message.attachments),
        prompt_tokens: Set(message.prompt_tokens),
        completion_tokens: Set(message.completion_tokens),
        kind: Set(message.kind),
        system_type: Set(message.system_type),
        compute: Set(message.compute),
        covers_through_id: Set(message.covers_through_id),
        tool_calls: Set(message.tool_calls),
        tool_record: Set(message.tool_record),
    })
    .on_conflict(
        OnConflict::column(message::Column::Id)
            .update_columns([
                message::Column::SessionId,
                message::Column::Role,
                message::Column::Content,
                message::Column::ModelId,
                message::Column::CreatedAt,
                message::Column::FinishReason,
                message::Column::TimeToFirstTokenMs,
                message::Column::TotalTimeMs,
                message::Column::TokenCount,
                message::Column::PromptChars,
                message::Column::Attachments,
                message::Column::PromptTokens,
                message::Column::CompletionTokens,
                message::Column::Kind,
                message::Column::SystemType,
                message::Column::Compute,
                message::Column::CoversThroughId,
                message::Column::ToolCalls,
                message::Column::ToolRecord,
            ])
            .to_owned(),
    )
    .exec(&*db)
    .await
    .map_err(|e| e.to_string())?;

    // Touch the session's updated_at timestamp.
    let now = now_millis();
    chat_session::Entity::update_many()
        .col_expr(chat_session::Column::UpdatedAt, Expr::value(now))
        .filter(chat_session::Column::Id.eq(&session_id))
        .exec(&*db)
        .await
        .map_err(|e| e.to_string())?;

    // The message is saved either way. A failed capability note is logged, not returned.
    if let Some((model, content)) = reply_evidence {
        if let Err(e) = capability_scan::note_saved_reply(&db, &model, &content).await {
            eprintln!("[capabilities] could not record thinking from a saved reply: {e}");
        }
    }

    Ok(())
}

/// Refused when a summary row is deleted or a message that a summary covers.
const REFUSE_SUMMARY_ROW: &str = "A conversation summary cannot be deleted.";
const REFUSE_COVERED: &str = "This message is covered by a summary and cannot be deleted.";

/// Deletes one message and the errors attached to it. A message covered by a summary cannot be
/// deleted. A missing message is a no-op.
#[tauri::command]
pub async fn delete_message(
    db: tauri::State<'_, DatabaseConnection>,
    id: String,
) -> Result<(), String> {
    delete_message_rows(&db, &id).await
}

/// The guarded delete behind `delete_message`: check, then remove the message and its errors in one
/// transaction.
async fn delete_message_rows(db: &DatabaseConnection, id: &str) -> Result<(), String> {
    let txn = db.begin().await.map_err(|e| e.to_string())?;
    if let Some(target) = message::Entity::find_by_id(id)
        .one(&txn)
        .await
        .map_err(|e| e.to_string())?
    {
        let ordered = session_messages_in_order(&txn, &target.session_id).await?;
        check_deletable(id, &ordered)?;
    }
    // Errors attached to the reply go with it.
    chat_error::Entity::delete_many()
        .filter(chat_error::Column::MessageId.eq(id))
        .exec(&txn)
        .await
        .map_err(|e| e.to_string())?;
    message::Entity::delete_by_id(id)
        .exec(&txn)
        .await
        .map_err(|e| e.to_string())?;
    txn.commit().await.map_err(|e| e.to_string())
}

/// The messages of a session in load order: created_at, then id. Read inside the delete's
/// transaction so the check and the delete see the same rows.
async fn session_messages_in_order(
    txn: &impl ConnectionTrait,
    session_id: &str,
) -> Result<Vec<message::Model>, String> {
    message::Entity::find()
        .filter(message::Column::SessionId.eq(session_id))
        .order_by_asc(message::Column::CreatedAt)
        .order_by_asc(message::Column::Id)
        .all(txn)
        .await
        .map_err(|e| e.to_string())
}

/// Decides whether message `id` may be deleted. `ordered` holds the session's messages in load
/// order. A summary row is never deleted. A message is covered when it sits at or before the last
/// message any summary in the session covers, so it cannot be deleted either. An id that is not in
/// `ordered` is allowed, since the delete then does nothing.
fn check_deletable(id: &str, ordered: &[message::Model]) -> Result<(), String> {
    let Some(target) = ordered.iter().position(|m| m.id == id) else {
        return Ok(());
    };
    if is_summary_row(&ordered[target]) {
        return Err(REFUSE_SUMMARY_ROW.to_owned());
    }
    let covered_through = ordered
        .iter()
        .filter(|m| is_summary_row(m))
        .filter_map(|s| s.covers_through_id.as_deref())
        .filter_map(|covers| ordered.iter().position(|m| m.id == covers))
        .max();
    match covered_through {
        Some(last) if target <= last => Err(REFUSE_COVERED.to_owned()),
        _ => Ok(()),
    }
}

/// True for a compaction summary row.
fn is_summary_row(message: &message::Model) -> bool {
    message.kind == "system" && message.system_type.as_deref() == Some(SYSTEM_TYPE_SUMMARY)
}

// ─── Chat Errors ───────────────────────────────────────────────────

/// Persist a chat error. `message_id` links it to the reply it belongs to, or is null.
#[tauri::command]
pub async fn save_chat_error(
    db: tauri::State<'_, DatabaseConnection>,
    error: chat_error::Model,
) -> Result<(), String> {
    chat_error::Entity::insert(chat_error::ActiveModel {
        id: Set(error.id),
        session_id: Set(error.session_id),
        message_id: Set(error.message_id),
        error: Set(error.error),
        created_at: Set(error.created_at),
    })
    .on_conflict(
        OnConflict::column(chat_error::Column::Id)
            .update_columns([
                chat_error::Column::SessionId,
                chat_error::Column::MessageId,
                chat_error::Column::Error,
                chat_error::Column::CreatedAt,
            ])
            .to_owned(),
    )
    .exec(&*db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Forget a chat error (used when its message is removed by a retry).
#[tauri::command]
pub async fn delete_chat_error(
    db: tauri::State<'_, DatabaseConnection>,
    id: String,
) -> Result<(), String> {
    chat_error::Entity::delete_by_id(&id)
        .exec(&*db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Model Settings ────────────────────────────────────────────────

/// Saved settings for a model, keyed by setting name. Empty when nothing is saved.
#[tauri::command]
pub async fn load_model_settings(
    db: tauri::State<'_, DatabaseConnection>,
    model_id: String,
) -> Result<HashMap<String, serde_json::Value>, String> {
    model_settings::load(&db, &model_id).await
}

/// Replaces the saved settings for a model with `settings`. Keys left out are removed. A change of
/// the saved context window (including a reset) recomputes the model's stored KV-cache RAM. That
/// recompute never fails the save.
#[tauri::command]
pub async fn save_model_settings(
    db: tauri::State<'_, DatabaseConnection>,
    model_id: String,
    settings: HashMap<String, serde_json::Value>,
) -> Result<(), String> {
    let before = model_settings::load(&db, &model_id)
        .await
        .ok()
        .and_then(|saved| ram_store::saved_context(&saved));
    let after = ram_store::saved_context(&settings);
    model_settings::save(&db, &model_id, settings).await?;
    if before != after {
        ram_store::refresh_by_name_or_log(&db, &model_id).await;
    }
    Ok(())
}

// ─── User Preferences ──────────────────────────────────────────────

#[tauri::command]
pub async fn get_preference(
    db: tauri::State<'_, DatabaseConnection>,
    key: String,
) -> Result<Option<String>, String> {
    let result = user_preference::Entity::find_by_id(&key)
        .one(&*db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(result.map(|r| r.value))
}

#[tauri::command]
pub async fn set_preference(
    db: tauri::State<'_, DatabaseConnection>,
    key: String,
    value: String,
    pref_type: String,
) -> Result<(), String> {
    user_preference::Entity::insert(user_preference::ActiveModel {
        key: Set(key),
        value: Set(value),
        pref_type: Set(pref_type),
    })
    .on_conflict(
        OnConflict::column(user_preference::Column::Key)
            .update_columns([
                user_preference::Column::Value,
                user_preference::Column::PrefType,
            ])
            .to_owned(),
    )
    .exec(&*db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Downloaded Model Metadata ─────────────────────────────────────

/// Upsert local metadata recorded when a model is pulled from a hub.
/// `context_size` / `param_count` are tokens / parameters (pass null when
/// the hub metadata is unavailable).
/// `repo_url` and `model_card` are optional metadata from Hugging Face.
/// `facets` is the facet summary as a JSON object (text), or null.
// Each argument is a separate Tauri IPC field, as with import_gguf.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn upsert_downloaded_model(
    db: tauri::State<'_, DatabaseConnection>,
    name: String,
    precision: Option<String>,
    context_size: Option<i64>,
    param_count: Option<i64>,
    repo_url: Option<String>,
    model_card: Option<String>,
    facets: Option<String>,
) -> Result<(), String> {
    store_downloaded_model(
        &db,
        DownloadedModelRow {
            name,
            precision,
            context_size,
            param_count,
            repo_url,
            model_card,
            facets,
        },
    )
    .await
}

/// The metadata `upsert_downloaded_model` stores for one model.
#[derive(Debug, Clone)]
pub(super) struct DownloadedModelRow {
    pub name: String,
    pub precision: Option<String>,
    pub context_size: Option<i64>,
    pub param_count: Option<i64>,
    pub repo_url: Option<String>,
    pub model_card: Option<String>,
    pub facets: Option<String>,
}

/// Insert or update the metadata row of a model, then compute its RAM columns. Used by the command
/// and by backend imports. The RAM columns are cleared first, so a failed compute leaves them null
/// rather than stale. That compute never fails the store.
pub(super) async fn store_downloaded_model(
    db: &DatabaseConnection,
    row: DownloadedModelRow,
) -> Result<(), String> {
    validate_facets(row.facets.as_deref())?;
    let now = now_millis();
    let name = row.name.clone();
    downloaded_model::Entity::insert(downloaded_model::ActiveModel {
        name: Set(row.name),
        precision: Set(row.precision),
        context_size: Set(row.context_size),
        param_count: Set(row.param_count),
        repo_url: Set(row.repo_url),
        model_card: Set(row.model_card),
        facets: Set(row.facets),
        base_ram_bytes: Set(None),
        context_ram_bytes: Set(None),
        ram_approximate: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    })
    .on_conflict(
        OnConflict::column(downloaded_model::Column::Name)
            .update_columns([
                downloaded_model::Column::Precision,
                downloaded_model::Column::ContextSize,
                downloaded_model::Column::ParamCount,
                downloaded_model::Column::RepoUrl,
                downloaded_model::Column::ModelCard,
                downloaded_model::Column::Facets,
                downloaded_model::Column::BaseRamBytes,
                downloaded_model::Column::ContextRamBytes,
                downloaded_model::Column::RamApproximate,
                downloaded_model::Column::UpdatedAt,
            ])
            .to_owned(),
    )
    .exec(db)
    .await
    .map_err(|e| e.to_string())?;
    ram_store::refresh_by_name_or_log(db, &name).await;
    Ok(())
}

/// True when a metadata row exists for `name`, the repo a model was imported as.
pub(super) async fn has_downloaded_model(
    db: &DatabaseConnection,
    name: &str,
) -> Result<bool, String> {
    downloaded_model::Entity::find_by_id(name)
        .one(db)
        .await
        .map(|row| row.is_some())
        .map_err(|e| e.to_string())
}

/// Forget the metadata row of `name`. Nothing happens when there is none.
pub(super) async fn forget_downloaded_model(
    db: &DatabaseConnection,
    name: &str,
) -> Result<(), String> {
    downloaded_model::Entity::delete_by_id(name)
        .exec(db)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// All downloaded-model metadata rows.
#[tauri::command]
pub async fn list_downloaded_models(
    db: tauri::State<'_, DatabaseConnection>,
) -> Result<Vec<downloaded_model::Model>, String> {
    downloaded_model::Entity::find()
        .all(&*db)
        .await
        .map_err(|e| e.to_string())
}

/// Forget metadata for a removed model.
#[tauri::command]
pub async fn delete_downloaded_model(
    db: tauri::State<'_, DatabaseConnection>,
    name: String,
) -> Result<(), String> {
    downloaded_model::Entity::delete_by_id(&name)
        .exec(&*db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Facets are stored as text the frontend reads back as an object, so anything else is refused.
fn validate_facets(facets: Option<&str>) -> Result<(), String> {
    let Some(text) = facets else {
        return Ok(());
    };
    match serde_json::from_str::<serde_json::Value>(text) {
        Ok(serde_json::Value::Object(_)) => Ok(()),
        _ => Err("Model facets must be a JSON object".to_owned()),
    }
}

/// Where a downloaded model came from. Kept in its facets JSON under `source`, set by the import
/// command (not derived from the name). Same vocabulary as `ModelInfo.source`.
pub(super) const SOURCE_HF: &str = "hf";
pub(super) const SOURCE_AIHUB: &str = "aihub";

/// Facets JSON with `source` set to `source`. Null facets become an object holding only the source.
/// Anything that is not a JSON object is refused.
pub(super) fn facets_with_source(facets: Option<&str>, source: &str) -> Result<String, String> {
    let mut map = match facets {
        None => serde_json::Map::new(),
        Some(text) => match serde_json::from_str::<serde_json::Value>(text) {
            Ok(serde_json::Value::Object(map)) => map,
            _ => return Err("Model facets must be a JSON object".to_owned()),
        },
    };
    map.insert(
        "source".to_owned(),
        serde_json::Value::String(source.to_owned()),
    );
    serde_json::to_string(&map).map_err(|e| e.to_string())
}

/// The stored source in a facets JSON text, or None when there is none (rows from before the
/// source was kept, or an unknown value).
fn source_of_facets(facets: Option<&str>) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(facets?).ok()?;
    match value.get("source")?.as_str()? {
        s @ (SOURCE_HF | SOURCE_AIHUB) => Some(s.to_owned()),
        _ => None,
    }
}

/// Stored source for every downloaded model that has one, keyed by the model name.
pub(super) async fn stored_sources(
    db: &DatabaseConnection,
) -> Result<HashMap<String, String>, String> {
    let rows = downloaded_model::Entity::find()
        .all(db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .filter_map(|r| source_of_facets(r.facets.as_deref()).map(|s| (r.name, s)))
        .collect())
}

// ─── Helpers ───────────────────────────────────────────────────────

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod facet_tests {
    use super::{facets_with_source, source_of_facets, validate_facets, SOURCE_AIHUB, SOURCE_HF};

    #[test]
    fn source_is_written_into_facets_and_read_back() {
        let null = facets_with_source(None, SOURCE_HF).unwrap();
        assert_eq!(source_of_facets(Some(&null)).as_deref(), Some("hf"));

        let kept = facets_with_source(Some(r#"{"library":"gguf"}"#), SOURCE_AIHUB).unwrap();
        assert_eq!(source_of_facets(Some(&kept)).as_deref(), Some("aihub"));
        assert!(kept.contains("\"library\":\"gguf\""));
        assert!(validate_facets(Some(&kept)).is_ok());
    }

    #[test]
    fn source_refuses_non_object_facets_and_unknown_values() {
        assert!(facets_with_source(Some("[1]"), SOURCE_HF).is_err());
        assert!(facets_with_source(Some("not json"), SOURCE_HF).is_err());
        assert_eq!(source_of_facets(None), None);
        assert_eq!(source_of_facets(Some(r#"{"library":"gguf"}"#)), None);
        assert_eq!(source_of_facets(Some(r#"{"source":"docker"}"#)), None);
    }

    #[test]
    fn facets_accept_null_and_objects_only() {
        assert!(validate_facets(None).is_ok());
        assert!(validate_facets(Some(r#"{"task":"text-generation"}"#)).is_ok());
        assert!(validate_facets(Some("[]")).is_err());
        assert!(validate_facets(Some("\"text\"")).is_err());
        assert!(validate_facets(Some("{not json")).is_err());
    }
}

#[cfg(test)]
mod delete_guard_tests {
    use super::{check_deletable, delete_message_rows, session_messages_in_order};
    use crate::entities::{chat_session, message};
    use crate::migrations::Migrator;
    use sea_orm::{
        ActiveModelTrait, ConnectionTrait, Database, DatabaseBackend, DatabaseConnection,
        EntityTrait, Set, Statement,
    };
    use sea_orm_migration::MigratorTrait;

    /// A chat message, created at `created_at`.
    fn chat(id: &str, created_at: i64) -> message::Model {
        message::Model {
            id: id.into(),
            session_id: "s".into(),
            role: "user".into(),
            content: "text".into(),
            model_id: None,
            created_at,
            finish_reason: None,
            time_to_first_token_ms: None,
            total_time_ms: None,
            token_count: None,
            prompt_chars: None,
            attachments: None,
            prompt_tokens: None,
            completion_tokens: None,
            kind: "text".into(),
            system_type: None,
            compute: None,
            covers_through_id: None,
            tool_calls: None,
            tool_record: None,
        }
    }

    /// A summary row, created at `created_at`, covering the messages through `covers`.
    fn summary(id: &str, created_at: i64, covers: &str) -> message::Model {
        message::Model {
            kind: "system".into(),
            system_type: Some("summary".into()),
            covers_through_id: Some(covers.into()),
            role: "system".into(),
            ..chat(id, created_at)
        }
    }

    /// Session order: a question and answer, a summary covering them, then a new question.
    fn summarised_session() -> Vec<message::Model> {
        vec![
            chat("u1", 1),
            chat("a1", 2),
            summary("sum", 3, "a1"),
            chat("u2", 4),
        ]
    }

    #[test]
    fn a_summary_row_is_refused() {
        let ordered = summarised_session();
        assert!(check_deletable("sum", &ordered).is_err());
    }

    #[test]
    fn a_message_covered_by_a_summary_is_refused() {
        let ordered = summarised_session();
        assert!(check_deletable("u1", &ordered).is_err());
        assert!(check_deletable("a1", &ordered).is_err());
    }

    #[test]
    fn a_message_after_the_summary_is_allowed() {
        let ordered = summarised_session();
        assert!(check_deletable("u2", &ordered).is_ok());
    }

    #[test]
    fn a_session_without_summaries_is_allowed() {
        let ordered = vec![chat("u1", 1), chat("a1", 2)];
        assert!(check_deletable("u1", &ordered).is_ok());
        assert!(check_deletable("a1", &ordered).is_ok());
    }

    #[test]
    fn with_two_summaries_the_later_one_decides_how_far_coverage_reaches() {
        // The first summary covers a1; the second covers a2 and so reaches further.
        let ordered = vec![
            chat("u1", 1),
            chat("a1", 2),
            summary("sum1", 3, "a1"),
            chat("u2", 4),
            chat("a2", 5),
            summary("sum2", 6, "a2"),
            chat("u3", 7),
        ];
        assert!(check_deletable("u1", &ordered).is_err());
        assert!(check_deletable("u2", &ordered).is_err());
        assert!(check_deletable("a2", &ordered).is_err());
        assert!(check_deletable("sum1", &ordered).is_err());
        assert!(check_deletable("u3", &ordered).is_ok());
    }

    #[test]
    fn a_summary_covering_a_message_outside_the_session_covers_nothing() {
        let ordered = vec![chat("u1", 1), summary("sum", 2, "gone")];
        assert!(check_deletable("u1", &ordered).is_ok());
    }

    #[test]
    fn a_missing_message_is_allowed_so_the_delete_is_a_no_op() {
        let ordered = summarised_session();
        assert!(check_deletable("missing", &ordered).is_ok());
        assert!(check_deletable("missing", &[]).is_ok());
    }

    /// A fresh database file in the temp dir, removed when the test ends.
    struct TempDb(std::path::PathBuf);

    impl TempDb {
        fn new(name: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            Self(std::env::temp_dir().join(format!(
                "localgenie-{name}-{}-{nanos}.db",
                std::process::id()
            )))
        }

        fn url(&self) -> String {
            format!("sqlite:{}?mode=rwc", self.0.display())
        }
    }

    impl Drop for TempDb {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    async fn insert(db: &DatabaseConnection, row: message::Model) {
        message::ActiveModel {
            id: Set(row.id),
            session_id: Set(row.session_id),
            role: Set(row.role),
            content: Set(row.content),
            created_at: Set(row.created_at),
            kind: Set(row.kind),
            system_type: Set(row.system_type),
            covers_through_id: Set(row.covers_through_id),
            ..Default::default()
        }
        .insert(db)
        .await
        .expect("insert message");
    }

    #[tokio::test]
    async fn delete_refuses_covered_rows_and_keeps_later_ones() {
        let tmp = TempDb::new("delete-guard");
        let url = tmp.url();
        let db = Database::connect(&url).await.expect("connect");
        db.execute(Statement::from_string(
            DatabaseBackend::Sqlite,
            "PRAGMA foreign_keys = ON".to_owned(),
        ))
        .await
        .expect("foreign keys");
        Migrator::up(&db, None).await.expect("migrations apply");

        chat_session::ActiveModel {
            id: Set("s".into()),
            title: Set("t".into()),
            model_id: Set(None),
            context_chars: Set(0),
            created_at: Set(1),
            updated_at: Set(1),
            pinned: Set(false),
            settings_overrides: Set(None),
        }
        .insert(&db)
        .await
        .expect("insert session");
        for row in summarised_session() {
            insert(&db, row).await;
        }

        let ordered = session_messages_in_order(&db, "s").await.expect("load");
        assert_eq!(ordered.len(), 4);
        assert!(check_deletable("a1", &ordered).is_err());

        delete_message_rows(&db, "a1").await.expect_err("covered");
        delete_message_rows(&db, "sum")
            .await
            .expect_err("summary row");
        delete_message_rows(&db, "u2")
            .await
            .expect("after the summary");
        delete_message_rows(&db, "missing")
            .await
            .expect("missing is a no-op");

        let left = message::Entity::find()
            .all(&db)
            .await
            .expect("query")
            .into_iter()
            .map(|m| m.id)
            .collect::<Vec<_>>();
        assert!(left.contains(&"u1".to_owned()));
        assert!(left.contains(&"a1".to_owned()));
        assert!(left.contains(&"sum".to_owned()));
        assert!(!left.contains(&"u2".to_owned()));
    }
}

#[cfg(test)]
mod message_kind_tests {
    use super::check_message_kind;
    use crate::entities::message;

    fn message(kind: &str, system_type: Option<&str>) -> message::Model {
        message::Model {
            id: "m".into(),
            session_id: "s".into(),
            role: "system".into(),
            content: "{}".into(),
            model_id: None,
            created_at: 0,
            finish_reason: None,
            time_to_first_token_ms: None,
            total_time_ms: None,
            token_count: None,
            prompt_chars: None,
            attachments: None,
            prompt_tokens: None,
            completion_tokens: None,
            kind: kind.into(),
            system_type: system_type.map(str::to_owned),
            compute: None,
            covers_through_id: None,
            tool_calls: None,
            tool_record: None,
        }
    }

    fn covering(mut message: message::Model, covers: Option<&str>) -> message::Model {
        message.covers_through_id = covers.map(str::to_owned);
        message
    }

    #[test]
    fn accepts_chat_messages_and_typed_system_lines() {
        assert!(check_message_kind(&message("text", None)).is_ok());
        assert!(check_message_kind(&message("system", Some("model_changed"))).is_ok());
    }

    #[test]
    fn refuses_untyped_system_lines_and_typed_chat_messages() {
        assert!(check_message_kind(&message("system", None)).is_err());
        assert!(check_message_kind(&message("system", Some("Model Changed"))).is_err());
        assert!(check_message_kind(&message("text", Some("model_changed"))).is_err());
        assert!(check_message_kind(&message("other", None)).is_err());
    }

    #[test]
    fn a_summary_needs_the_id_of_the_last_message_it_covers() {
        let summary = message("system", Some("summary"));
        assert!(check_message_kind(&covering(summary.clone(), None)).is_err());
        assert!(check_message_kind(&covering(summary.clone(), Some(""))).is_err());
        assert!(check_message_kind(&covering(summary, Some("m9"))).is_ok());
    }

    #[test]
    fn accepts_a_tool_message_without_system_type_or_covers() {
        assert!(check_message_kind(&message("tool", None)).is_ok());
        assert!(check_message_kind(&message("tool", Some("model_changed"))).is_err());
        assert!(check_message_kind(&covering(message("tool", None), Some("m9"))).is_err());
    }

    #[test]
    fn tool_fields_use_camel_case_on_the_wire() {
        let mut tool = message("tool", None);
        tool.tool_record = Some(r#"{"callId":"c1"}"#.into());
        tool.tool_calls = Some(r#"[{"id":"c1"}]"#.into());
        let json = serde_json::to_value(&tool).expect("serialize");
        assert_eq!(json["toolRecord"], r#"{"callId":"c1"}"#);
        assert_eq!(json["toolCalls"], r#"[{"id":"c1"}]"#);
        assert!(json.get("tool_record").is_none());

        // A message from before the fields, sent without them, reads as None.
        let mut without = serde_json::to_value(message("text", None)).expect("serialize");
        let object = without.as_object_mut().expect("object");
        object.remove("toolCalls");
        object.remove("toolRecord");
        let read: message::Model = serde_json::from_value(without).expect("deserialize");
        assert_eq!(read.tool_calls, None);
        assert_eq!(read.tool_record, None);
    }

    #[test]
    fn no_other_message_may_name_covered_messages() {
        let chat = message("text", None);
        assert!(check_message_kind(&covering(chat, Some("m9"))).is_err());
        let line = message("system", Some("model_changed"));
        assert!(check_message_kind(&covering(line, Some("m9"))).is_err());
    }
}

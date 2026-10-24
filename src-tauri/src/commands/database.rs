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
    chat_session::Entity::insert(chat_session::ActiveModel {
        id: Set(session.id),
        title: Set(session.title),
        model_id: Set(session.model_id),
        context_chars: Set(session.context_chars),
        created_at: Set(session.created_at),
        updated_at: Set(session.updated_at),
    })
    .on_conflict(
        OnConflict::column(chat_session::Column::Id)
            .update_columns([
                chat_session::Column::Title,
                chat_session::Column::ModelId,
                chat_session::Column::ContextChars,
                chat_session::Column::CreatedAt,
                chat_session::Column::UpdatedAt,
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

#[tauri::command]
pub async fn save_message(
    db: tauri::State<'_, DatabaseConnection>,
    session_id: String,
    message: message::Model,
) -> Result<(), String> {
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

#[tauri::command]
pub async fn delete_message(
    db: tauri::State<'_, DatabaseConnection>,
    id: String,
) -> Result<(), String> {
    // Errors attached to the reply go with it.
    let txn = db.begin().await.map_err(|e| e.to_string())?;
    chat_error::Entity::delete_many()
        .filter(chat_error::Column::MessageId.eq(&id))
        .exec(&txn)
        .await
        .map_err(|e| e.to_string())?;
    message::Entity::delete_by_id(&id)
        .exec(&txn)
        .await
        .map_err(|e| e.to_string())?;
    txn.commit().await.map_err(|e| e.to_string())
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

/// Replaces the saved settings for a model with `settings`. Keys left out are removed.
#[tauri::command]
pub async fn save_model_settings(
    db: tauri::State<'_, DatabaseConnection>,
    model_id: String,
    settings: HashMap<String, serde_json::Value>,
) -> Result<(), String> {
    model_settings::save(&db, &model_id, settings).await
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
#[tauri::command]
pub async fn upsert_downloaded_model(
    db: tauri::State<'_, DatabaseConnection>,
    name: String,
    precision: Option<String>,
    context_size: Option<i64>,
    param_count: Option<i64>,
    repo_url: Option<String>,
    model_card: Option<String>,
) -> Result<(), String> {
    let now = now_millis();
    downloaded_model::Entity::insert(downloaded_model::ActiveModel {
        name: Set(name),
        precision: Set(precision),
        context_size: Set(context_size),
        param_count: Set(param_count),
        repo_url: Set(repo_url),
        model_card: Set(model_card),
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
                downloaded_model::Column::UpdatedAt,
            ])
            .to_owned(),
    )
    .exec(&*db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
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

// ─── Helpers ───────────────────────────────────────────────────────

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

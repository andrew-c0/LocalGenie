use sea_orm::prelude::*;
use sea_orm::{
    ColumnTrait, Database, DatabaseBackend, DatabaseConnection, EntityTrait,
    QueryFilter, QueryOrder, Set, Statement,
};
use sea_orm::sea_query::{Expr, OnConflict};
use sea_orm_migration::MigratorTrait;
use serde::{Deserialize, Serialize};

use crate::entities::{chat_session, downloaded_model, message, model_setting, user_preference};
use crate::migrations::Migrator;

// ─── Types ─────────────────────────────────────────────────────────

/// Full session with messages — returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSessionWithMessages {
    #[serde(flatten)]
    pub session: chat_session::Model,
    pub messages: Vec<message::Model>,
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

    // Group messages by session_id
    let mut msgs_by_session: Vec<(String, Vec<message::Model>)> = session_ids
        .iter()
        .map(|id| (id.clone(), Vec::new()))
        .collect();
    for msg in all_messages {
        if let Some(entry) = msgs_by_session.iter_mut().find(|(id, _)| *id == msg.session_id) {
            entry.1.push(msg);
        }
    }

    let mut result = Vec::with_capacity(sessions.len());
    for s in sessions {
        let messages = msgs_by_session
            .iter()
            .find(|(id, _)| *id == s.id)
            .map(|(_, msgs)| msgs.clone())
            .unwrap_or_default();
        result.push(ChatSessionWithMessages {
            session: s,
            messages,
        });
    }
    Ok(result)
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
    message::Entity::delete_many()
        .filter(message::Column::SessionId.eq(&id))
        .exec(&*db)
        .await
        .map_err(|e| e.to_string())?;

    chat_session::Entity::delete_by_id(&id)
        .exec(&*db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Messages ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn save_message(
    db: tauri::State<'_, DatabaseConnection>,
    session_id: String,
    message: message::Model,
) -> Result<(), String> {
    message::Entity::insert(message::ActiveModel {
        id: Set(message.id),
        session_id: Set(session_id.clone()),
        role: Set(message.role),
        content: Set(message.content),
        model_id: Set(message.model_id),
        created_at: Set(message.created_at),
    })
    .on_conflict(
        OnConflict::column(message::Column::Id)
            .update_columns([
                message::Column::SessionId,
                message::Column::Role,
                message::Column::Content,
                message::Column::ModelId,
                message::Column::CreatedAt,
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

    Ok(())
}

#[tauri::command]
pub async fn delete_message(
    db: tauri::State<'_, DatabaseConnection>,
    id: String,
) -> Result<(), String> {
    message::Entity::delete_by_id(&id)
        .exec(&*db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Model Settings ────────────────────────────────────────────────

#[tauri::command]
pub async fn load_model_settings(
    db: tauri::State<'_, DatabaseConnection>,
    model_id: String,
) -> Result<Option<String>, String> {
    let result = model_setting::Entity::find_by_id(&model_id)
        .one(&*db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(result.map(|r| r.settings))
}

#[tauri::command]
pub async fn save_model_settings(
    db: tauri::State<'_, DatabaseConnection>,
    model_id: String,
    settings: String,
) -> Result<(), String> {
    let now = now_millis();
    model_setting::Entity::insert(model_setting::ActiveModel {
        model_id: Set(model_id),
        settings: Set(settings),
        updated_at: Set(now),
    })
    .on_conflict(
        OnConflict::column(model_setting::Column::ModelId)
            .update_columns([
                model_setting::Column::Settings,
                model_setting::Column::UpdatedAt,
            ])
            .to_owned(),
    )
    .exec(&*db)
    .await
    .map_err(|e| e.to_string())?;
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
#[tauri::command]
pub async fn upsert_downloaded_model(
    db: tauri::State<'_, DatabaseConnection>,
    name: String,
    precision: Option<String>,
    context_size: Option<i64>,
    param_count: Option<i64>,
) -> Result<(), String> {
    let now = now_millis();
    downloaded_model::Entity::insert(downloaded_model::ActiveModel {
        name: Set(name),
        precision: Set(precision),
        context_size: Set(context_size),
        param_count: Set(param_count),
        created_at: Set(now),
        updated_at: Set(now),
    })
    .on_conflict(
        OnConflict::column(downloaded_model::Column::Name)
            .update_columns([
                downloaded_model::Column::Precision,
                downloaded_model::Column::ContextSize,
                downloaded_model::Column::ParamCount,
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
        .expect("system time before UNIX epoch")
        .as_millis() as i64
}

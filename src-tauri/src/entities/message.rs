use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone)]
#[sea_orm(table_name = "messages")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub model_id: Option<String>,
    pub created_at: i64,
    /// Server `finish_reason` ("stop", "length", "cancelled"); None when unknown.
    pub finish_reason: Option<String>,
    /// Generation stats in ms / counts; None for messages saved before stats were kept.
    pub time_to_first_token_ms: Option<i64>,
    pub total_time_ms: Option<i64>,
    pub token_count: Option<i64>,
    pub prompt_chars: Option<i64>,
    /// JSON array of the attachments sent with a user message: `id`, `kind`, `name`, `size`, `path`, and `chars`
    /// for text files. Null when none.
    pub attachments: Option<String>,
    /// Exact counts from the server for an assistant reply: the whole prompt, and the tokens generated.
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    /// `text` for a chat message, `system` for a system line such as a model change.
    pub kind: String,
    /// The type of a system line, such as `model_changed`. Null for chat messages.
    pub system_type: Option<String>,
    /// The compute target (`npu`, `gpu` or `cpu`) an assistant reply was generated on. Null when not kept.
    pub compute: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::chat_session::Entity",
        from = "Column::SessionId",
        to = "super::chat_session::Column::Id"
    )]
    ChatSession,
}

impl Related<super::chat_session::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ChatSession.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

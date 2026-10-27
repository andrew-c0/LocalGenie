use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(DeriveEntityModel, Serialize, Deserialize, Debug, Clone)]
#[sea_orm(table_name = "chat_sessions")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub title: String,
    pub model_id: Option<String>,
    pub context_chars: i64,
    pub created_at: i64,
    pub updated_at: i64,
    /// Pinned conversations are listed first.
    pub pinned: bool,
    /// JSON object of the settings this chat overrides, or null when it uses the model's.
    pub settings_overrides: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::message::Entity")]
    Messages,
}

impl Related<super::message::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Messages.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

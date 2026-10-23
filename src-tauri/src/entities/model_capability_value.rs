use sea_orm::entity::prelude::*;

/// One probe result for one setting of one model. `value` holds the result's JSON.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "model_capability_values")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub model_id: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub key: String,
    pub value: String,
    pub updated_at: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

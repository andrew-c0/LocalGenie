use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Creates `model_capability_values`: one row per probed setting per model, the same shape as
/// `model_setting_values`. Starts empty; nothing is copied.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(ModelCapabilityValues::Table)
                    .col(
                        ColumnDef::new(ModelCapabilityValues::ModelId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ModelCapabilityValues::Key)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ModelCapabilityValues::Value)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ModelCapabilityValues::UpdatedAt)
                            .big_integer()
                            .not_null(),
                    )
                    .primary_key(
                        Index::create()
                            .col(ModelCapabilityValues::ModelId)
                            .col(ModelCapabilityValues::Key),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ModelCapabilityValues::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum ModelCapabilityValues {
    Table,
    ModelId,
    Key,
    Value,
    UpdatedAt,
}

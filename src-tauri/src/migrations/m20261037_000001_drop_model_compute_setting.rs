use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Removes the per-model `compute` setting rows. The compute target is chosen in the model selector
/// now, so a model no longer carries its own; the key is gone from the settings list, and an old row
/// would only sit unused. Nothing is restored on the way down: the rows held no information the app
/// still uses.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("DELETE FROM model_setting_values WHERE key = 'compute'")
            .await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}

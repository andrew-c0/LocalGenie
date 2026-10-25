use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// The Windows power plan and battery state a benchmark run was made under. Null for runs made
/// before this was recorded. SQLite takes one column change per ALTER TABLE, so each is its own step.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(BenchmarkRuns::Table)
                    .add_column(ColumnDef::new(BenchmarkRuns::WindowsPowerPlan).string())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(BenchmarkRuns::Table)
                    .add_column(ColumnDef::new(BenchmarkRuns::OnBattery).boolean())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(BenchmarkRuns::Table)
                    .drop_column(BenchmarkRuns::WindowsPowerPlan)
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(BenchmarkRuns::Table)
                    .drop_column(BenchmarkRuns::OnBattery)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum BenchmarkRuns {
    Table,
    WindowsPowerPlan,
    OnBattery,
}

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// How many times a prompt and a suite have been run since they were last saved. The runner adds
/// one per completed run; saving the prompt or suite resets it to zero.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for table in [BenchmarkPrompts::Table.into_iden(), BenchmarkSuites::Table.into_iden()] {
            manager
                .alter_table(
                    Table::alter()
                        .table(table)
                        .add_column(
                            ColumnDef::new(RunCount::RunCount)
                                .big_integer()
                                .not_null()
                                .default(0),
                        )
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for table in [BenchmarkPrompts::Table.into_iden(), BenchmarkSuites::Table.into_iden()] {
            manager
                .alter_table(
                    Table::alter()
                        .table(table)
                        .drop_column(RunCount::RunCount)
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }
}

#[derive(Iden)]
enum BenchmarkPrompts {
    Table,
}

#[derive(Iden)]
enum BenchmarkSuites {
    Table,
}

#[derive(Iden)]
enum RunCount {
    RunCount,
}

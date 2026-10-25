use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Benchmark suite storage: prompt library, suites (test runs) and their
/// recorded results. Every table holds structured columns; nothing is stored
/// as a JSON blob. Prompt text, file details and settings are copied into the
/// run tables, so a run keeps its record after the prompt or suite is deleted.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(BenchmarkPrompts::Table)
                    .if_not_exists()
                    .col(string_pk(BenchmarkPrompts::Id))
                    .col(ColumnDef::new(BenchmarkPrompts::Name).string().not_null())
                    .col(ColumnDef::new(BenchmarkPrompts::Description).string())
                    .col(ColumnDef::new(BenchmarkPrompts::MatchRule).string().not_null())
                    .col(big_int(BenchmarkPrompts::CreatedAt))
                    .col(big_int(BenchmarkPrompts::UpdatedAt))
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(BenchmarkPromptKeywords::Table)
                    .if_not_exists()
                    .col(string_col(BenchmarkPromptKeywords::PromptId).not_null())
                    .col(int_col(BenchmarkPromptKeywords::Position).not_null())
                    .col(string_col(BenchmarkPromptKeywords::Keyword).not_null())
                    .primary_key(
                        Index::create()
                            .col(BenchmarkPromptKeywords::PromptId)
                            .col(BenchmarkPromptKeywords::Position),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                BenchmarkPromptKeywords::Table,
                                BenchmarkPromptKeywords::PromptId,
                            )
                            .to(BenchmarkPrompts::Table, BenchmarkPrompts::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(BenchmarkFiles::Table)
                    .if_not_exists()
                    .col(string_pk(BenchmarkFiles::Id))
                    .col(ColumnDef::new(BenchmarkFiles::Name).string().not_null())
                    .col(ColumnDef::new(BenchmarkFiles::Kind).string().not_null())
                    .col(big_int(BenchmarkFiles::Size))
                    .col(ColumnDef::new(BenchmarkFiles::Chars).big_integer())
                    .col(ColumnDef::new(BenchmarkFiles::StoredPath).string().not_null())
                    .col(ColumnDef::new(BenchmarkFiles::Sha256).string().not_null())
                    .col(big_int(BenchmarkFiles::CreatedAt))
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(BenchmarkPromptFiles::Table)
                    .if_not_exists()
                    .col(string_col(BenchmarkPromptFiles::PromptId).not_null())
                    .col(int_col(BenchmarkPromptFiles::Position).not_null())
                    .col(string_col(BenchmarkPromptFiles::FileId).not_null())
                    .primary_key(
                        Index::create()
                            .col(BenchmarkPromptFiles::PromptId)
                            .col(BenchmarkPromptFiles::Position),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(BenchmarkPromptFiles::Table, BenchmarkPromptFiles::PromptId)
                            .to(BenchmarkPrompts::Table, BenchmarkPrompts::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(BenchmarkPromptFiles::Table, BenchmarkPromptFiles::FileId)
                            .to(BenchmarkFiles::Table, BenchmarkFiles::Id)
                            .on_delete(ForeignKeyAction::Restrict),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(BenchmarkSuites::Table)
                    .if_not_exists()
                    .col(string_pk(BenchmarkSuites::Id))
                    .col(ColumnDef::new(BenchmarkSuites::Name).string().not_null())
                    .col(ColumnDef::new(BenchmarkSuites::Description).string())
                    .col(ColumnDef::new(BenchmarkSuites::Mode).string().not_null())
                    .col(int_col(BenchmarkSuites::WarmupRuns).not_null())
                    .col(int_col(BenchmarkSuites::Repetitions).not_null())
                    .col(big_int(BenchmarkSuites::CreatedAt))
                    .col(big_int(BenchmarkSuites::UpdatedAt))
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(BenchmarkSuiteSteps::Table)
                    .if_not_exists()
                    .col(string_pk(BenchmarkSuiteSteps::Id))
                    .col(string_col(BenchmarkSuiteSteps::SuiteId).not_null())
                    .col(int_col(BenchmarkSuiteSteps::Position).not_null())
                    .col(string_col(BenchmarkSuiteSteps::PromptId).not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(BenchmarkSuiteSteps::Table, BenchmarkSuiteSteps::SuiteId)
                            .to(BenchmarkSuites::Table, BenchmarkSuites::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    // A prompt used by a suite cannot be deleted; the app lists the suites instead.
                    .foreign_key(
                        ForeignKey::create()
                            .from(BenchmarkSuiteSteps::Table, BenchmarkSuiteSteps::PromptId)
                            .to(BenchmarkPrompts::Table, BenchmarkPrompts::Id)
                            .on_delete(ForeignKeyAction::Restrict),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(BenchmarkStepFiles::Table)
                    .if_not_exists()
                    .col(string_col(BenchmarkStepFiles::StepId).not_null())
                    .col(int_col(BenchmarkStepFiles::Position).not_null())
                    .col(string_col(BenchmarkStepFiles::FileId).not_null())
                    .primary_key(
                        Index::create()
                            .col(BenchmarkStepFiles::StepId)
                            .col(BenchmarkStepFiles::Position),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(BenchmarkStepFiles::Table, BenchmarkStepFiles::StepId)
                            .to(BenchmarkSuiteSteps::Table, BenchmarkSuiteSteps::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(BenchmarkStepFiles::Table, BenchmarkStepFiles::FileId)
                            .to(BenchmarkFiles::Table, BenchmarkFiles::Id)
                            .on_delete(ForeignKeyAction::Restrict),
                    )
                    .to_owned(),
            )
            .await?;

        // Run snapshot. `suite_id` is cleared when the suite is deleted, so the
        // record stays; `suite_name` keeps the name it had.
        manager
            .create_table(
                Table::create()
                    .table(BenchmarkRuns::Table)
                    .if_not_exists()
                    .col(string_pk(BenchmarkRuns::Id))
                    .col(string_col(BenchmarkRuns::SuiteId))
                    .col(ColumnDef::new(BenchmarkRuns::SuiteName).string().not_null())
                    .col(ColumnDef::new(BenchmarkRuns::ModelName).string().not_null())
                    .col(ColumnDef::new(BenchmarkRuns::ModelKey).string().not_null())
                    .col(ColumnDef::new(BenchmarkRuns::Compute).string().not_null())
                    .col(ColumnDef::new(BenchmarkRuns::Precision).string())
                    .col(big_int(BenchmarkRuns::Nctx))
                    .col(int_col(BenchmarkRuns::Ngl))
                    .col(ColumnDef::new(BenchmarkRuns::PowerMode).string())
                    .col(ColumnDef::new(BenchmarkRuns::Temperature).double())
                    .col(ColumnDef::new(BenchmarkRuns::TopP).double())
                    .col(big_int(BenchmarkRuns::Seed))
                    .col(big_int(BenchmarkRuns::MaxTokens))
                    .col(ColumnDef::new(BenchmarkRuns::Mode).string().not_null())
                    .col(int_col(BenchmarkRuns::WarmupRuns).not_null())
                    .col(int_col(BenchmarkRuns::Repetitions).not_null())
                    .col(ColumnDef::new(BenchmarkRuns::GeniexVersion).string())
                    .col(ColumnDef::new(BenchmarkRuns::Chipset).string())
                    .col(big_int(BenchmarkRuns::TotalMemoryBytes))
                    .col(ColumnDef::new(BenchmarkRuns::Status).string().not_null())
                    .col(ColumnDef::new(BenchmarkRuns::Error).string())
                    .col(big_int(BenchmarkRuns::StartedAt).not_null())
                    .col(big_int(BenchmarkRuns::FinishedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .from(BenchmarkRuns::Table, BenchmarkRuns::SuiteId)
                            .to(BenchmarkSuites::Table, BenchmarkSuites::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(BenchmarkRunSteps::Table)
                    .if_not_exists()
                    .col(string_pk(BenchmarkRunSteps::Id))
                    .col(string_col(BenchmarkRunSteps::RunId).not_null())
                    .col(int_col(BenchmarkRunSteps::Position).not_null())
                    .col(int_col(BenchmarkRunSteps::RepetitionIndex).not_null())
                    .col(ColumnDef::new(BenchmarkRunSteps::IsWarmup).boolean().not_null())
                    .col(ColumnDef::new(BenchmarkRunSteps::PromptName).string().not_null())
                    .col(ColumnDef::new(BenchmarkRunSteps::PromptText).string().not_null())
                    .col(ColumnDef::new(BenchmarkRunSteps::OutputText).string())
                    .col(ColumnDef::new(BenchmarkRunSteps::TtftMs).double())
                    .col(big_int(BenchmarkRunSteps::TotalMs))
                    .col(ColumnDef::new(BenchmarkRunSteps::TokensPerSec).double())
                    .col(big_int(BenchmarkRunSteps::PromptTokens))
                    .col(big_int(BenchmarkRunSteps::CompletionTokens))
                    .col(big_int(BenchmarkRunSteps::PeakModelMemoryBytes))
                    .col(big_int(BenchmarkRunSteps::AvgModelMemoryBytes))
                    .col(big_int(BenchmarkRunSteps::PeakMemoryUsedBytes))
                    .col(ColumnDef::new(BenchmarkRunSteps::AvgCpu).double())
                    .col(ColumnDef::new(BenchmarkRunSteps::AvgGpu).double())
                    .col(ColumnDef::new(BenchmarkRunSteps::AvgNpu).double())
                    .col(ColumnDef::new(BenchmarkRunSteps::Passed).boolean())
                    .col(int_col(BenchmarkRunSteps::MatchedKeywords))
                    .col(int_col(BenchmarkRunSteps::ExpectedKeywords))
                    .col(ColumnDef::new(BenchmarkRunSteps::Status).string().not_null())
                    .col(ColumnDef::new(BenchmarkRunSteps::Error).string())
                    .foreign_key(
                        ForeignKey::create()
                            .from(BenchmarkRunSteps::Table, BenchmarkRunSteps::RunId)
                            .to(BenchmarkRuns::Table, BenchmarkRuns::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(BenchmarkRunStepFiles::Table)
                    .if_not_exists()
                    .col(string_col(BenchmarkRunStepFiles::RunStepId).not_null())
                    .col(int_col(BenchmarkRunStepFiles::Position).not_null())
                    .col(ColumnDef::new(BenchmarkRunStepFiles::Name).string().not_null())
                    .col(ColumnDef::new(BenchmarkRunStepFiles::Kind).string().not_null())
                    .col(big_int(BenchmarkRunStepFiles::Size))
                    .col(ColumnDef::new(BenchmarkRunStepFiles::Sha256).string().not_null())
                    .primary_key(
                        Index::create()
                            .col(BenchmarkRunStepFiles::RunStepId)
                            .col(BenchmarkRunStepFiles::Position),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(BenchmarkRunStepFiles::Table, BenchmarkRunStepFiles::RunStepId)
                            .to(BenchmarkRunSteps::Table, BenchmarkRunSteps::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_benchmark_runs_started_at")
                    .table(BenchmarkRuns::Table)
                    .col(BenchmarkRuns::StartedAt)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_benchmark_run_steps_run_id")
                    .table(BenchmarkRunSteps::Table)
                    .col(BenchmarkRunSteps::RunId)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Children first, so no foreign key points at a dropped table.
        for table in [
            "benchmark_run_step_files",
            "benchmark_run_steps",
            "benchmark_runs",
            "benchmark_step_files",
            "benchmark_suite_steps",
            "benchmark_suites",
            "benchmark_prompt_files",
            "benchmark_files",
            "benchmark_prompt_keywords",
            "benchmark_prompts",
        ] {
            manager
                .drop_table(Table::drop().table(Alias::new(table)).if_exists().to_owned())
                .await?;
        }
        Ok(())
    }
}

fn string_pk(col: impl IntoIden) -> ColumnDef {
    ColumnDef::new(col).string().not_null().primary_key().to_owned()
}

fn string_col(col: impl IntoIden) -> ColumnDef {
    ColumnDef::new(col).string().to_owned()
}

fn int_col(col: impl IntoIden) -> ColumnDef {
    ColumnDef::new(col).integer().to_owned()
}

fn big_int(col: impl IntoIden) -> ColumnDef {
    ColumnDef::new(col).big_integer().to_owned()
}

#[derive(Iden)]
enum BenchmarkPrompts {
    Table,
    Id,
    Name,
    Description,
    MatchRule,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum BenchmarkPromptKeywords {
    Table,
    PromptId,
    Position,
    Keyword,
}

#[derive(Iden)]
enum BenchmarkFiles {
    Table,
    Id,
    Name,
    Kind,
    Size,
    Chars,
    StoredPath,
    Sha256,
    CreatedAt,
}

#[derive(Iden)]
enum BenchmarkPromptFiles {
    Table,
    PromptId,
    Position,
    FileId,
}

#[derive(Iden)]
enum BenchmarkSuites {
    Table,
    Id,
    Name,
    Description,
    Mode,
    WarmupRuns,
    Repetitions,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum BenchmarkSuiteSteps {
    Table,
    Id,
    SuiteId,
    Position,
    PromptId,
}

#[derive(Iden)]
enum BenchmarkStepFiles {
    Table,
    StepId,
    Position,
    FileId,
}

#[derive(Iden)]
enum BenchmarkRuns {
    Table,
    Id,
    SuiteId,
    SuiteName,
    ModelName,
    ModelKey,
    Compute,
    Precision,
    Nctx,
    Ngl,
    PowerMode,
    Temperature,
    TopP,
    Seed,
    MaxTokens,
    Mode,
    WarmupRuns,
    Repetitions,
    GeniexVersion,
    Chipset,
    TotalMemoryBytes,
    Status,
    Error,
    StartedAt,
    FinishedAt,
}

#[derive(Iden)]
enum BenchmarkRunSteps {
    Table,
    Id,
    RunId,
    Position,
    RepetitionIndex,
    IsWarmup,
    PromptName,
    PromptText,
    OutputText,
    TtftMs,
    TotalMs,
    TokensPerSec,
    PromptTokens,
    CompletionTokens,
    PeakModelMemoryBytes,
    AvgModelMemoryBytes,
    PeakMemoryUsedBytes,
    AvgCpu,
    AvgGpu,
    AvgNpu,
    Passed,
    MatchedKeywords,
    ExpectedKeywords,
    Status,
    Error,
}

#[derive(Iden)]
enum BenchmarkRunStepFiles {
    Table,
    RunStepId,
    Position,
    Name,
    Kind,
    Size,
    Sha256,
}

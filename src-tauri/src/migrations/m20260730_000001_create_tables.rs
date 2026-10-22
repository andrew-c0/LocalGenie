use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(ChatSessions::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ChatSessions::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(ChatSessions::Title).string().not_null())
                    .col(ColumnDef::new(ChatSessions::ModelId).string())
                    .col(
                        ColumnDef::new(ChatSessions::ContextChars)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(ChatSessions::CreatedAt)
                            .big_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ChatSessions::UpdatedAt)
                            .big_integer()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Messages::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Messages::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Messages::SessionId).string().not_null())
                    .col(ColumnDef::new(Messages::Role).string().not_null())
                    .col(ColumnDef::new(Messages::Content).string().not_null())
                    .col(ColumnDef::new(Messages::ModelId).string())
                    .col(ColumnDef::new(Messages::CreatedAt).big_integer().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_messages_session")
                            .from(Messages::Table, Messages::SessionId)
                            .to(ChatSessions::Table, ChatSessions::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(ModelSettings::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ModelSettings::ModelId)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(ModelSettings::Settings).string().not_null())
                    .col(
                        ColumnDef::new(ModelSettings::UpdatedAt)
                            .big_integer()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(UserPreferences::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(UserPreferences::Key)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(UserPreferences::Value).string().not_null())
                    .col(
                        ColumnDef::new(UserPreferences::PrefType)
                            .string()
                            .not_null()
                            .default("string"),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_messages_session")
                    .table(Messages::Table)
                    .col(Messages::SessionId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_sessions_updated")
                    .table(ChatSessions::Table)
                    .col(ChatSessions::UpdatedAt)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(UserPreferences::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(ModelSettings::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Messages::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(ChatSessions::Table).to_owned())
            .await?;
        Ok(())
    }
}

// ─── Iden enums for type-safe table/column references ──────────────

#[derive(Iden)]
enum ChatSessions {
    Table,
    Id,
    Title,
    ModelId,
    ContextChars,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum Messages {
    Table,
    Id,
    SessionId,
    Role,
    Content,
    ModelId,
    CreatedAt,
}

#[derive(Iden)]
enum ModelSettings {
    Table,
    ModelId,
    Settings,
    UpdatedAt,
}

#[derive(Iden)]
enum UserPreferences {
    Table,
    Key,
    Value,
    #[iden = "type"]
    PrefType,
}

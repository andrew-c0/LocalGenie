use sea_orm_migration::prelude::*;

mod m20260730_000001_create_tables;
mod m20261007_000001_downloaded_models;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260730_000001_create_tables::Migration),
            Box::new(m20261007_000001_downloaded_models::Migration),
        ]
    }
}

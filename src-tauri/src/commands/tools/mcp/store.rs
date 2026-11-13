//! The saved MCP servers in the `mcp_server` table. The JSON columns are read and written here only.
//! A server's slug is picked here when the server is first saved and kept on every later save.

use std::collections::{BTreeMap, HashSet};

use sea_orm::sea_query::OnConflict;
use sea_orm::{DatabaseConnection, EntityTrait, QueryOrder, Set};

use super::config::{McpServerConfig, McpTransport};
use super::naming;
use crate::entities::mcp_server;

/// Every saved server, oldest first.
pub async fn list(db: &DatabaseConnection) -> Result<Vec<McpServerConfig>, String> {
    let rows = mcp_server::Entity::find()
        .order_by_asc(mcp_server::Column::CreatedAt)
        .order_by_asc(mcp_server::Column::Id)
        .all(db)
        .await
        .map_err(|error| format!("Could not read the MCP servers: {error}"))?;
    rows.into_iter().map(config_of_row).collect()
}

/// The saved server with this id, if there is one.
pub async fn find(db: &DatabaseConnection, id: &str) -> Result<Option<McpServerConfig>, String> {
    mcp_server::Entity::find_by_id(id)
        .one(db)
        .await
        .map_err(|error| format!("Could not read the MCP server: {error}"))?
        .map(config_of_row)
        .transpose()
}

/// Insert or update a server and return it as stored, with its slug. `previous` is the saved server
/// with this id, if there is one: it keeps its slug, so a rename does not change tool names. A new
/// server gets the first slug its name leaves free. The creation time is kept on an update.
pub async fn save(
    db: &DatabaseConnection,
    config: &McpServerConfig,
    previous: Option<&McpServerConfig>,
) -> Result<McpServerConfig, String> {
    let slug = match previous {
        Some(previous) => previous.slug.clone(),
        None => naming::new_server_slug(&config.name, &taken_slugs(db).await?),
    };
    let saved = McpServerConfig {
        slug,
        ..config.clone()
    };
    let row = mcp_server::ActiveModel {
        id: Set(saved.id.clone()),
        name: Set(saved.name.clone()),
        transport: Set(saved.transport.as_str().to_string()),
        command: Set(saved.command.clone()),
        args: Set(json_text(&saved.args)?),
        env: Set(json_text(&saved.env)?),
        cwd: Set(saved.cwd.clone()),
        url: Set(saved.url.clone()),
        headers: Set(json_text(&saved.headers)?),
        enabled: Set(saved.enabled),
        slug: Set(saved.slug.clone()),
        created_at: Set(chrono::Utc::now().timestamp_millis()),
    };
    let update_columns = [
        mcp_server::Column::Name,
        mcp_server::Column::Transport,
        mcp_server::Column::Command,
        mcp_server::Column::Args,
        mcp_server::Column::Env,
        mcp_server::Column::Cwd,
        mcp_server::Column::Url,
        mcp_server::Column::Headers,
        mcp_server::Column::Enabled,
    ];
    mcp_server::Entity::insert(row)
        .on_conflict(
            OnConflict::column(mcp_server::Column::Id)
                .update_columns(update_columns)
                .to_owned(),
        )
        .exec(db)
        .await
        .map_err(|error| format!("Could not save the MCP server: {error}"))?;
    Ok(saved)
}

/// Delete a saved server. Deleting a missing id is not an error.
pub async fn delete(db: &DatabaseConnection, id: &str) -> Result<(), String> {
    mcp_server::Entity::delete_by_id(id)
        .exec(db)
        .await
        .map_err(|error| format!("Could not remove the MCP server: {error}"))?;
    Ok(())
}

/// The slugs of every saved server.
async fn taken_slugs(db: &DatabaseConnection) -> Result<HashSet<String>, String> {
    let rows = mcp_server::Entity::find()
        .all(db)
        .await
        .map_err(|error| format!("Could not read the MCP servers: {error}"))?;
    Ok(rows.into_iter().map(|row| row.slug).collect())
}

fn json_text<T: serde::Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| format!("Could not store the MCP server: {error}"))
}

fn config_of_row(row: mcp_server::Model) -> Result<McpServerConfig, String> {
    let transport = McpTransport::from_str_value(&row.transport).ok_or_else(|| {
        format!(
            "Unknown MCP transport '{}' in the saved settings.",
            row.transport
        )
    })?;
    Ok(McpServerConfig {
        id: row.id,
        name: row.name,
        transport,
        command: row.command,
        args: parse_json(&row.args, "arguments")?,
        env: parse_json::<BTreeMap<String, String>>(&row.env, "environment")?,
        cwd: row.cwd,
        url: row.url,
        headers: parse_json::<BTreeMap<String, String>>(&row.headers, "headers")?,
        enabled: row.enabled,
        slug: row.slug,
    })
}

fn parse_json<T: serde::de::DeserializeOwned>(text: &str, what: &str) -> Result<T, String> {
    serde_json::from_str(text)
        .map_err(|error| format!("The saved MCP {what} are not valid: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::database::init_database;

    /// Fresh database file in the temp dir, removed when the test ends.
    struct TempDb(std::path::PathBuf);

    impl TempDb {
        fn new(name: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            Self(std::env::temp_dir().join(format!(
                "localgenie-{name}-{}-{nanos}.db",
                std::process::id()
            )))
        }

        fn url(&self) -> String {
            format!("sqlite:{}?mode=rwc", self.0.display())
        }
    }

    impl Drop for TempDb {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    fn stdio_server() -> McpServerConfig {
        McpServerConfig {
            id: "srv-stdio".into(),
            name: "Docs".into(),
            transport: McpTransport::Stdio,
            command: Some("npx".into()),
            args: vec!["-y".into(), "docs-server".into()],
            env: BTreeMap::from([("TOKEN".to_string(), "secret".to_string())]),
            cwd: Some("C:/work".into()),
            url: None,
            headers: BTreeMap::new(),
            enabled: true,
            slug: String::new(),
        }
    }

    fn http_server() -> McpServerConfig {
        McpServerConfig {
            id: "srv-http".into(),
            name: "Remote".into(),
            transport: McpTransport::Http,
            command: None,
            args: Vec::new(),
            env: BTreeMap::new(),
            cwd: None,
            url: Some("https://mcp.example/mcp".into()),
            headers: BTreeMap::from([("Authorization".to_string(), "Bearer t".to_string())]),
            enabled: false,
            slug: String::new(),
        }
    }

    fn named(id: &str, name: &str) -> McpServerConfig {
        McpServerConfig {
            id: id.into(),
            name: name.into(),
            ..stdio_server()
        }
    }

    #[tokio::test]
    async fn saved_servers_round_trip_through_the_table() {
        let tmp = TempDb::new("mcp-round-trip");
        let db = init_database(&tmp.url()).await.expect("migrations apply");

        let stdio = save(&db, &stdio_server(), None).await.expect("save stdio");
        let http = save(&db, &http_server(), None).await.expect("save http");

        let listed = list(&db).await.expect("list");
        assert_eq!(listed.len(), 2);
        assert!(listed.contains(&stdio));
        assert!(listed.contains(&http));
        assert_eq!(stdio.slug, "docs");
        assert_eq!(find(&db, "srv-http").await.expect("find"), Some(http));
        assert_eq!(find(&db, "missing").await.expect("find"), None);
    }

    #[tokio::test]
    async fn an_update_changes_the_row_and_keeps_its_creation_time_and_slug() {
        let tmp = TempDb::new("mcp-update");
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        let first = save(&db, &stdio_server(), None).await.expect("save");
        let created = mcp_server::Entity::find_by_id("srv-stdio")
            .one(&db)
            .await
            .expect("query")
            .expect("row")
            .created_at;

        let renamed = McpServerConfig {
            name: "Renamed".into(),
            enabled: false,
            slug: "ignored-by-the-backend".into(),
            ..first.clone()
        };
        let saved = save(&db, &renamed, Some(&first)).await.expect("update");

        assert_eq!(saved.slug, "docs");
        assert_eq!(list(&db).await.expect("list"), vec![saved]);
        let after = mcp_server::Entity::find_by_id("srv-stdio")
            .one(&db)
            .await
            .expect("query")
            .expect("row");
        assert_eq!(after.created_at, created);
    }

    #[tokio::test]
    async fn servers_with_the_same_name_get_numbered_slugs() {
        let tmp = TempDb::new("mcp-slugs");
        let db = init_database(&tmp.url()).await.expect("migrations apply");

        let first = save(&db, &named("a", "Docs"), None).await.expect("first");
        let second = save(&db, &named("b", "docs"), None).await.expect("second");
        let third = save(&db, &named("c", "DOCS"), None).await.expect("third");

        assert_eq!(first.slug, "docs");
        assert_eq!(second.slug, "docs_2");
        assert_eq!(third.slug, "docs_3");
    }

    #[tokio::test]
    async fn a_rename_keeps_the_slug_so_the_old_name_stays_taken() {
        let tmp = TempDb::new("mcp-rename-slug");
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        let first = save(&db, &named("a", "Docs"), None).await.expect("first");
        save(&db, &named("a", "Other"), Some(&first))
            .await
            .expect("rename");

        let newcomer = save(&db, &named("b", "Docs"), None)
            .await
            .expect("newcomer");
        assert_eq!(newcomer.slug, "docs_2");
    }

    #[tokio::test]
    async fn a_removed_server_frees_its_slug() {
        let tmp = TempDb::new("mcp-freed-slug");
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        save(&db, &named("a", "Docs"), None).await.expect("first");
        delete(&db, "a").await.expect("delete");

        let newcomer = save(&db, &named("b", "Docs"), None)
            .await
            .expect("newcomer");
        assert_eq!(newcomer.slug, "docs");
    }

    #[tokio::test]
    async fn a_removed_server_is_gone() {
        let tmp = TempDb::new("mcp-delete");
        let db = init_database(&tmp.url()).await.expect("migrations apply");
        save(&db, &stdio_server(), None).await.expect("save");

        delete(&db, "srv-stdio").await.expect("delete");
        assert!(list(&db).await.expect("list").is_empty());
        delete(&db, "srv-stdio")
            .await
            .expect("deleting a missing id is fine");
    }

    #[test]
    fn a_row_with_an_unknown_transport_is_a_readable_error() {
        let row = mcp_server::Model {
            id: "x".into(),
            name: "x".into(),
            transport: "carrier-pigeon".into(),
            command: None,
            args: "[]".into(),
            env: "{}".into(),
            cwd: None,
            url: None,
            headers: "{}".into(),
            enabled: false,
            slug: "x".into(),
            created_at: 0,
        };
        assert_eq!(
            config_of_row(row).expect_err("transport"),
            "Unknown MCP transport 'carrier-pigeon' in the saved settings."
        );
    }
}
